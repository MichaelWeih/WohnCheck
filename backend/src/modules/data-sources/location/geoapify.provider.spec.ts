import { GeoapifyProvider, normalizeAddress } from "./geoapify.provider";
import {
  OutboundHttpError,
  OutboundHttpService,
} from "../../../common/http/outbound-http.types";
import { LocationProviderException } from "./location-errors";

const berlin = {
  formatted: "Kaiser-Wilhelm-Straße 103, 12247 Berlin, Deutschland",
  lat: 52.4384639,
  lon: 13.3496772,
  street: "Kaiser-Wilhelm-Straße",
  housenumber: "103",
  postcode: "12247",
  city: "Berlin",
  district: "Steglitz-Zehlendorf",
  country: "Deutschland",
  country_code: "de",
  place_id: "berlin-103",
  result_type: "building",
  rank: {
    confidence: 1,
    confidence_city_level: 1,
    confidence_street_level: 1,
    confidence_building_level: 1,
  },
};

describe("Geoapify adapter", () => {
  const http = { registerHost: jest.fn(), getJson: jest.fn() };
  const provider = new GeoapifyProvider(http as unknown as OutboundHttpService);
  const original = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEOAPIFY_API_KEY = "fixture-key";
    delete process.env.GEOAPIFY_BASE_URL;
    delete process.env.GEOAPIFY_REQUESTS_PER_SECOND;
    delete process.env.GEOAPIFY_DAILY_BUDGET;
  });

  afterAll(() => {
    process.env = original;
  });

  describe("configuration", () => {
    it("reports a configuration error without a key and sends nothing", async () => {
      delete process.env.GEOAPIFY_API_KEY;
      const error = await provider.search("Berlin", true).catch((e) => e);
      expect(error).toBeInstanceOf(LocationProviderException);
      expect(error.code).toBe("NOT_CONFIGURED");
      expect(error.message).toContain("Schlüssel");
      expect(http.getJson).not.toHaveBeenCalled();
    });

    it("registers the configured host with the provider limiter", async () => {
      process.env.GEOAPIFY_BASE_URL = "https://geo.example.test";
      process.env.GEOAPIFY_REQUESTS_PER_SECOND = "4";
      process.env.GEOAPIFY_DAILY_BUDGET = "900";
      http.getJson.mockResolvedValue({ features: [] });
      await provider.search("Berlin", true);
      expect(http.registerHost).toHaveBeenCalledWith({
        host: "geo.example.test",
        minIntervalMs: 250,
        dailyBudget: 900,
      });
      expect(http.getJson.mock.calls[0][0]).toContain(
        "https://geo.example.test/v1/geocode/autocomplete?",
      );
    });

    it("limits the search to Germany and asks for one retry at most", async () => {
      http.getJson.mockResolvedValue({ features: [] });
      await provider.search("Teststraße 1", false);
      const [url, options] = http.getJson.mock.calls[0];
      expect(url).toContain("/v1/geocode/search?");
      expect(new URL(url).searchParams.get("filter")).toBe("countrycode:de");
      expect(options).toMatchObject({ retries: 1, timeoutMs: 12000 });
    });
  });

  describe("geocoding", () => {
    it("normalizes street, house number, postal code, city and country", async () => {
      http.getJson.mockResolvedValue({ features: [{ properties: berlin }] });
      expect(await provider.search("Kaiser-Wilhelm-Straße 103", false)).toEqual(
        [
          {
            id: "berlin-103",
            label: "Kaiser-Wilhelm-Straße 103, 12247 Berlin, Deutschland",
            shortLabel: "Kaiser-Wilhelm-Straße 103",
            latitude: 52.4384639,
            longitude: 13.3496772,
            street: "Kaiser-Wilhelm-Straße",
            houseNumber: "103",
            postalCode: "12247",
            city: "Berlin",
            district: "Steglitz-Zehlendorf",
            country: "Deutschland",
            countryCode: "de",
            accuracy: "building",
            confidence: 1,
          },
        ],
      );
    });

    it("marks a street without house number as street-level", () => {
      const address = normalizeAddress({
        properties: {
          ...berlin,
          housenumber: undefined,
          formatted: "Kaiser-Wilhelm-Straße, 12247 Berlin, Deutschland",
          rank: { confidence: 1, confidence_city_level: 1 },
        },
      })!;
      expect(address.accuracy).toBe("street");
      expect(address.houseNumber).toBeUndefined();
      expect(address.shortLabel).toBe("Kaiser-Wilhelm-Straße");
    });

    it("drops a house number the provider could not confirm", () => {
      const address = normalizeAddress({
        properties: {
          ...berlin,
          housenumber: "9999",
          formatted: "Kaiser-Wilhelm-Straße 9999, 12247 Berlin, Deutschland",
          rank: {
            confidence: 0.5,
            confidence_city_level: 1,
            confidence_building_level: 0,
          },
        },
      })!;
      expect(address.accuracy).toBe("street");
      expect(address.houseNumber).toBeUndefined();
      expect(address.label).toBe(
        "Kaiser-Wilhelm-Straße, 12247 Berlin, Deutschland",
      );
      expect(address.label).not.toContain("9999");
    });

    it("does not fill in missing address parts", () => {
      const address = normalizeAddress({
        properties: { formatted: "Berlin, Deutschland", lat: 52.5, lon: 13.4 },
      })!;
      expect(address).toMatchObject({ accuracy: "area", label: "Berlin, Deutschland" });
      expect(address.street).toBeUndefined();
      expect(address.postalCode).toBeUndefined();
      expect(address.city).toBeUndefined();
      expect(address.confidence).toBeUndefined();
    });

    it("lowers the confidence when no city was matched", () => {
      expect(
        normalizeAddress({
          properties: { ...berlin, rank: { confidence: 1 } },
        })!.confidence,
      ).toBe(0.5);
    });

    it("discards noise, foreign hits and unusable coordinates", async () => {
      http.getJson.mockResolvedValue({
        features: [
          { properties: { ...berlin, rank: { confidence: 0 } } },
          { properties: { ...berlin, country_code: "at" } },
          { properties: { ...berlin, lat: undefined, lon: undefined } },
          { properties: { ...berlin, formatted: undefined } },
        ],
      });
      expect(await provider.search("qqqqzzzz 99", false)).toEqual([]);
    });

    it("returns one entry per address when businesses share it", async () => {
      http.getJson.mockResolvedValue({
        features: [
          { properties: berlin },
          {
            properties: {
              ...berlin,
              place_id: "shop",
              formatted: "Laden, Kaiser-Wilhelm-Straße 103, 12247 Berlin",
            },
          },
        ],
      });
      expect(await provider.search("Kaiser-Wilhelm-Straße 103", true)).toHaveLength(1);
    });

    it("rejects a malformed provider answer", async () => {
      http.getJson.mockResolvedValue({ message: "unexpected" });
      await expect(provider.search("Berlin", false)).rejects.toThrow(
        "Invalid geocoding response",
      );
    });
  });

  describe("places", () => {
    const page = (count: number, offset = 0) => ({
      features: Array.from({ length: count }, (_, i) => ({
        properties: {
          place_id: String(offset + i),
          lat: 52,
          lon: 13,
          categories: ["commercial.supermarket"],
        },
      })),
    });

    it("queries the categories of one main category in a circle around the address", async () => {
      http.getJson.mockResolvedValue(page(3));
      const result = await provider.searchNearby(52, 13, 1000, "shopping");
      expect(http.getJson).toHaveBeenCalledTimes(1);
      const params = new URL(http.getJson.mock.calls[0][0]).searchParams;
      expect(params.get("filter")).toBe("circle:13,52,1000");
      expect(params.get("limit")).toBe("100");
      expect(params.get("categories")).toContain("commercial.supermarket");
      // Pharmacies also count as shopping; transit categories are not part of this request.
      expect(params.get("categories")).toContain("healthcare.pharmacy");
      expect(params.get("categories")).not.toContain("public_transport");
      expect(result).toMatchObject({ truncated: false });
      expect(result.places).toHaveLength(3);
    });

    it("follows the pagination until a page is not full", async () => {
      http.getJson
        .mockResolvedValueOnce(page(100))
        .mockResolvedValueOnce(page(100, 100))
        .mockResolvedValueOnce(page(40, 200));
      const result = await provider.searchNearby(52, 13, 1000, "shopping");
      expect(http.getJson).toHaveBeenCalledTimes(3);
      expect(
        http.getJson.mock.calls.map(([url]) =>
          new URL(url).searchParams.get("offset"),
        ),
      ).toEqual(["0", "100", "200"]);
      expect(result.places).toHaveLength(240);
      expect(result.truncated).toBe(false);
    });

    it("stops at 500 places and marks the category as capped", async () => {
      http.getJson.mockImplementation(async (url: string) =>
        page(100, Number(new URL(url).searchParams.get("offset"))),
      );
      const result = await provider.searchNearby(52, 13, 1000, "shopping");
      expect(http.getJson).toHaveBeenCalledTimes(5);
      expect(result.places).toHaveLength(500);
      expect(result.truncated).toBe(true);
    });

    it("drops hits outside the radius even when the provider returns them", async () => {
      http.getJson.mockResolvedValue({
        features: [
          ...page(1).features,
          {
            properties: {
              place_id: "far",
              lat: 52.02,
              lon: 13,
              categories: ["commercial.supermarket"],
            },
          },
        ],
      });
      const result = await provider.searchNearby(52, 13, 1000, "shopping");
      expect(result.places.map((p) => p.id)).toEqual(["0"]);
    });

    it("propagates a timeout instead of reporting an empty area", async () => {
      http.getJson.mockRejectedValue(
        new OutboundHttpError("timed out", "timeout", "https://api", 0),
      );
      await expect(
        provider.searchNearby(52, 13, 1000, "shopping"),
      ).rejects.toMatchObject({ kind: "timeout" });
    });

    it("rejects a malformed provider answer", async () => {
      http.getJson.mockResolvedValue({});
      await expect(
        provider.searchNearby(52, 13, 1000, "shopping"),
      ).rejects.toThrow("Invalid places response");
    });
  });
});
