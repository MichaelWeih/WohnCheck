import { LocationService } from "./location.service";
import { PrismaService } from "../../prisma/prisma.service";
import { GeocodingProvider, PlacesProvider } from "./location-provider";
import { OutboundHttpError } from "../../../common/http/outbound-http.types";
import {
  Place,
  PlaceCategory,
  ResolvedAddress,
} from "../../../common/api/location-types";

const outboundError = (
  kind: ConstructorParameters<typeof OutboundHttpError>[1],
  status = 0,
  retryAt?: Date,
) => new OutboundHttpError(kind, kind, "https://api.geoapify.com/v2/places", status, retryAt);

const address = (overrides: Partial<ResolvedAddress> = {}): ResolvedAddress => ({
  id: "a",
  label: "Teststraße 1, 12345 Berlin",
  shortLabel: "Teststraße 1",
  latitude: 52,
  longitude: 13,
  accuracy: "building",
  confidence: 1,
  ...overrides,
});

const place = (id: string, category: PlaceCategory, distance = 100): Place => ({
  id,
  name: id,
  latitude: 52,
  longitude: 13,
  distanceMeters: distance,
  categories: [category],
  kinds: [],
  source: "fixture",
});

describe("LocationService", () => {
  const prisma = {
    sourceCache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    externalSource: { upsert: jest.fn() },
  };
  const geocoder = { search: jest.fn() };
  const provider = { searchNearby: jest.fn() };
  let service: LocationService;
  const key = process.env.GEOAPIFY_API_KEY;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GEOAPIFY_API_KEY = "fixture";
    service = new LocationService(
      prisma as unknown as PrismaService,
      geocoder as GeocodingProvider,
      provider as PlacesProvider,
    );
    // Keep the expected failure warnings out of the test output.
    jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        "warn",
      )
      .mockImplementation(() => undefined);
    prisma.sourceCache.findUnique.mockResolvedValue(null);
    prisma.sourceCache.deleteMany.mockResolvedValue({ count: 0 });
    provider.searchNearby.mockResolvedValue({ places: [], truncated: false });
  });

  afterAll(() => {
    if (key) process.env.GEOAPIFY_API_KEY = key;
    else delete process.env.GEOAPIFY_API_KEY;
  });

  describe("nearby places", () => {
    it("loads all seven categories with at most two provider requests at a time", async () => {
      let active = 0;
      let peak = 0;
      provider.searchNearby.mockImplementation(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return { places: [], truncated: false };
      });
      const result = await service.nearby(52, 13, 1000);
      expect(provider.searchNearby).toHaveBeenCalledTimes(7);
      expect(
        provider.searchNearby.mock.calls.map((call) => call[3]).sort(),
      ).toEqual([
        "education",
        "food",
        "health",
        "infrastructure",
        "leisure",
        "shopping",
        "transit",
      ]);
      expect(peak).toBe(2);
      expect(result).toMatchObject({
        center: { latitude: 52, longitude: 13 },
        radius: 1000,
        stale: false,
        incomplete: [],
        issues: [],
      });
    });

    it("coalesces identical concurrent requests", async () => {
      const [a, b] = await Promise.all([
        service.nearby(52, 13, 1000),
        service.nearby(52, 13, 1000),
      ]);
      expect(a).toBe(b);
      expect(provider.searchNearby).toHaveBeenCalledTimes(7);
      await service.nearby(52, 13, 2000);
      expect(provider.searchNearby).toHaveBeenCalledTimes(14);
    });

    it("stores a complete result for 24 hours under provider, version, coordinates and radius", async () => {
      await service.nearby(52.4384639, 13.3496772, 1000);
      const stored = prisma.sourceCache.upsert.mock.calls[0][0];
      expect(stored.where.cacheKey).toBe(
        "geoapify:nearby:v3:52.438464:13.349677:1000",
      );
      expect(stored.create.sourceKey).toBe("geoapify");
      expect(
        stored.create.expiresAt.getTime() - stored.create.fetchedAt.getTime(),
      ).toBe(24 * 60 * 60 * 1000);
      expect(stored.create.attribution).toContain("OpenStreetMap");
    });

    it("answers from a fresh cache entry without contacting the provider", async () => {
      const payload = { places: [], stale: false, radius: 1000 };
      prisma.sourceCache.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        fetchedAt: new Date(),
        payload,
      });
      expect(await service.nearby(52, 13, 1000)).toBe(payload);
      expect(provider.searchNearby).not.toHaveBeenCalled();
    });

    it("merges duplicates across categories and computes the metrics", async () => {
      provider.searchNearby.mockImplementation(
        async (_lat, _lon, _radius, category: PlaceCategory) => ({
          truncated: false,
          places:
            category === "health" || category === "shopping"
              ? [
                  {
                    ...place("pharmacy", category, 300),
                    categories: ["health", "shopping"],
                  },
                ]
              : category === "transit"
                ? [place("stop", "transit", 80)]
                : [],
        }),
      );
      const result = await service.nearby(52, 13, 1000);
      expect(result.places.map((p) => p.id)).toEqual(["stop", "pharmacy"]);
      expect(result.metrics.health.count500m).toBe(1);
      expect(result.metrics.shopping.count500m).toBe(1);
      expect(result.metrics.transit.nearestDistance).toBe(80);
    });

    it("marks capped categories as incomplete and still caches the result", async () => {
      provider.searchNearby.mockImplementation(
        async (_lat, _lon, _radius, category: PlaceCategory) => ({
          places: [place(category, category)],
          truncated: category === "leisure",
        }),
      );
      const result = await service.nearby(52, 13, 5000);
      expect(result.incomplete).toEqual(["leisure"]);
      expect(result.issues).toEqual([{ category: "leisure", reason: "limit" }]);
      expect(result.metrics.leisure.status).toBe("truncated");
      expect(result.metrics.leisure.count500mStatus).toBe("minimum");
      expect(prisma.sourceCache.upsert).toHaveBeenCalledTimes(1);
    });

    it("reports a partial failure, does not cache it and retries only the failed category", async () => {
      provider.searchNearby.mockImplementation(
        async (_lat, _lon, _radius, category: PlaceCategory) => {
          if (category === "health") throw outboundError("timeout");
          return { places: [place(category, category)], truncated: false };
        },
      );
      const partial = await service.nearby(52, 13, 1000);
      expect(partial.incomplete).toEqual(["health"]);
      expect(partial.issues).toEqual([{ category: "health", reason: "timeout" }]);
      expect(partial.metrics.health.status).toBe("unavailable");
      expect(partial.metrics.health.count500m).toBeNull();
      expect(partial.places).toHaveLength(6);
      expect(prisma.sourceCache.upsert).not.toHaveBeenCalled();

      provider.searchNearby.mockClear();
      provider.searchNearby.mockResolvedValue({
        places: [place("health", "health")],
        truncated: false,
      });
      const retried = await service.nearby(52, 13, 1000);
      expect(provider.searchNearby).toHaveBeenCalledTimes(1);
      expect(provider.searchNearby.mock.calls[0][3]).toBe("health");
      expect(retried.incomplete).toEqual([]);
      expect(retried.places).toHaveLength(7);
      expect(prisma.sourceCache.upsert).toHaveBeenCalledTimes(1);
    });

    it("distinguishes timeout, quota, configuration and general failures", async () => {
      const failWith = async (error: unknown) => {
        provider.searchNearby.mockRejectedValue(error);
        return service.nearby(52, 13, 1000).catch((e) => e);
      };
      const timeout = await failWith(outboundError("timeout"));
      expect(timeout.code).toBe("TIMEOUT");
      expect(timeout.getStatus()).toBe(504);

      const quota = await failWith(
        outboundError("rate_limited", 429, new Date(Date.now() + 90_000)),
      );
      expect(quota.code).toBe("QUOTA");
      expect(quota.getStatus()).toBe(503);
      expect(quota.getResponse().retryAfterSeconds).toBeGreaterThan(80);
      expect((await failWith(outboundError("budget"))).code).toBe("QUOTA");

      expect((await failWith(outboundError("http", 401))).code).toBe(
        "NOT_CONFIGURED",
      );
      const general = await failWith(new Error("boom"));
      expect(general.code).toBe("UNAVAILABLE");
      expect(general.message).not.toContain("boom");
    });

    it("stops asking the provider once the quota is exhausted", async () => {
      provider.searchNearby.mockRejectedValue(outboundError("rate_limited", 429));
      await service.nearby(52, 13, 1000).catch(() => undefined);
      // The first pair runs in parallel; the remaining five categories are not requested.
      expect(provider.searchNearby).toHaveBeenCalledTimes(2);
    });

    it("reports a missing key as a configuration error and has no demo fallback", async () => {
      delete process.env.GEOAPIFY_API_KEY;
      const error = await service.nearby(52, 13, 1000).catch((e) => e);
      expect(error.code).toBe("NOT_CONFIGURED");
      expect(error.getStatus()).toBe(503);
      expect(provider.searchNearby).not.toHaveBeenCalled();
    });

    it("serves expired data flagged as stale while the provider is down", async () => {
      prisma.sourceCache.findUnique.mockResolvedValue({
        expiresAt: new Date(0),
        fetchedAt: new Date(Date.now() - 6 * 86400000),
        payload: { places: [], stale: false, fetchedAt: "2026-11-12T10:00:00Z" },
      });
      provider.searchNearby.mockRejectedValue(outboundError("timeout"));
      const result = await service.nearby(52, 13, 1000);
      expect(result.stale).toBe(true);
      expect(result.fetchedAt).toBe("2026-11-12T10:00:00Z");
    });

    it("does not serve data older than seven days", async () => {
      prisma.sourceCache.findUnique.mockResolvedValue({
        expiresAt: new Date(0),
        fetchedAt: new Date(Date.now() - 8 * 86400000),
        payload: { places: [] },
      });
      provider.searchNearby.mockRejectedValue(outboundError("timeout"));
      await expect(service.nearby(52, 13, 1000)).rejects.toMatchObject({
        code: "TIMEOUT",
      });
    });

    it("removes cache entries past the stale limit", async () => {
      await service.nearby(52, 13, 1000);
      const where = prisma.sourceCache.deleteMany.mock.calls[0][0].where;
      expect(where.sourceKey).toBe("geoapify");
      expect(Date.now() - where.fetchedAt.lt.getTime()).toBeGreaterThanOrEqual(
        7 * 86400000,
      );
    });
  });

  describe("geocoding", () => {
    it("answers short queries without contacting the provider", async () => {
      expect(await service.geocode(" ab ", true)).toMatchObject({
        query: "ab",
        suggestions: [],
      });
      expect(geocoder.search).not.toHaveBeenCalled();
    });

    it("keeps the response shape of the former address-suggestions endpoint", async () => {
      geocoder.search.mockResolvedValue([address()]);
      const response = await service.geocode("Teststraße 1", true);
      expect(response).toEqual({
        query: "Teststraße 1",
        suggestions: [address()],
        source: {
          sourceKey: "geoapify",
          fromCache: false,
          isStale: false,
          license: "ODbL",
          attribution: "© OpenStreetMap contributors · Geoapify",
        },
      });
      expect(response.resolution).toBeUndefined();
    });

    it("caches suggestions briefly in memory and coalesces concurrent lookups", async () => {
      geocoder.search.mockResolvedValue([address()]);
      const [a, b] = await Promise.all([
        service.geocode("Teststraße 1", true),
        service.geocode("  teststraße   1 ", true),
      ]);
      expect(a.suggestions).toEqual(b.suggestions);
      expect(geocoder.search).toHaveBeenCalledTimes(1);
      expect((await service.geocode("Teststraße 1", true)).source.fromCache).toBe(
        true,
      );
      expect(geocoder.search).toHaveBeenCalledTimes(1);
      expect(prisma.sourceCache.upsert).not.toHaveBeenCalled();
    });

    it("expires cached suggestions after five minutes", async () => {
      geocoder.search.mockResolvedValue([address()]);
      const now = jest.spyOn(Date, "now");
      now.mockReturnValue(1_000_000);
      await service.geocode("Teststraße 1", true);
      now.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
      await service.geocode("Teststraße 1", true);
      expect(geocoder.search).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });

    it("only treats a single confident match as unique", async () => {
      geocoder.search.mockResolvedValueOnce([address()]);
      expect((await service.geocode("Eindeutig 1", false)).resolution).toBe(
        "unique",
      );
      geocoder.search.mockResolvedValueOnce([address({ confidence: 0.5 })]);
      expect((await service.geocode("Hauptstraße 5", false)).resolution).toBe(
        "ambiguous",
      );
      geocoder.search.mockResolvedValueOnce([address(), address({ id: "b" })]);
      expect((await service.geocode("Mehrdeutig 1", false)).resolution).toBe(
        "ambiguous",
      );
      geocoder.search.mockResolvedValueOnce([]);
      expect((await service.geocode("Unbekannt 1", false)).resolution).toBe(
        "none",
      );
    });

    it("maps provider failures and does not cache them", async () => {
      geocoder.search.mockRejectedValueOnce(outboundError("timeout"));
      await expect(service.geocode("Teststraße 1", true)).rejects.toMatchObject({
        code: "TIMEOUT",
      });
      geocoder.search.mockResolvedValueOnce([address()]);
      expect((await service.geocode("Teststraße 1", true)).suggestions).toHaveLength(1);
    });

    it("never writes the searched address to the log", async () => {
      const warn = (service as unknown as { logger: { warn: jest.Mock } }).logger
        .warn;
      geocoder.search.mockRejectedValue(new Error("Geheime Straße 7 failed"));
      await service.geocode("Geheime Straße 7", false).catch(() => undefined);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("Geheime");
    });
  });
});
