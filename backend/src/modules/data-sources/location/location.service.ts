import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { GeocodingProvider, PlacesProvider } from "./location-provider";
import {
  CategoryIssue,
  CategoryStatus,
  GeocodeResponse,
  LOCATION_ATTRIBUTION,
  NearbyPlacesResponse,
  PLACE_GROUPS,
  Place,
  PlaceCategory,
  ResolvedAddress,
} from "../../../common/api/location-types";
import { deduplicate, locationMetrics } from "./location-utils";
import {
  LocationProviderException,
  issueReason,
  missingKey,
  mostRelevant,
  toLocationException,
} from "./location-errors";

const SOURCE_KEY = "geoapify";
/** Part of every cache key. Bump when the payload shape or the category mapping changes. */
const DATA_VERSION = "v3";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Expired entries may still be served, flagged as stale, for this long while the provider is down. */
const STALE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const ADDRESS_TTL_MS = 5 * 60 * 1000;
const ADDRESS_CACHE_SIZE = 500;
/** Loaded categories of a partly failed request are kept briefly so a retry only repeats the failed ones. */
const CATEGORY_MEMO_TTL_MS = 10 * 60 * 1000;
const CATEGORY_MEMO_SIZE = 300;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
/** A single explicit geocoding hit is only used without asking from this confidence on. */
const UNIQUE_MATCH_CONFIDENCE = 0.8;
const MAX_CONCURRENT_PROVIDER_REQUESTS = 2;

type CategoryResult = { places: Place[]; truncated: boolean };

const GEOCODE_SOURCE = {
  sourceKey: SOURCE_KEY,
  isStale: false,
  license: "ODbL",
  attribution: LOCATION_ATTRIBUTION,
};

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly running = new Map<string, Promise<NearbyPlacesResponse>>();
  /** Address lookups live in memory only and for minutes: no address history is persisted or logged. */
  private readonly addresses = new Map<
    string,
    { expires: number; data: ResolvedAddress[] }
  >();
  private readonly searching = new Map<string, Promise<ResolvedAddress[]>>();
  private readonly categoryMemo = new Map<
    string,
    { expires: number; result: CategoryResult }
  >();
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoder: GeocodingProvider,
    private readonly places: PlacesProvider,
  ) {}

  /**
   * autocomplete = true: suggestions while typing. false: explicit resolution of a submitted address,
   * including whether the result is unambiguous enough to be used without a choice by the user.
   */
  async geocode(query: string, autocomplete: boolean): Promise<GeocodeResponse> {
    const normalized = query.trim().replace(/\s+/g, " ");
    if (normalized.length < 3)
      return this.geocodeResponse(normalized, [], autocomplete, false);
    const key = `${autocomplete}:${normalized.toLocaleLowerCase("de")}`;
    const cached = this.addresses.get(key);
    if (cached && cached.expires > Date.now())
      return this.geocodeResponse(normalized, cached.data, autocomplete, true);
    let task = this.searching.get(key);
    if (!task) {
      task = this.geocoder.search(normalized, autocomplete);
      this.searching.set(key, task);
      task
        .finally(() => this.searching.delete(key))
        .catch(() => undefined);
    }
    let data: ResolvedAddress[];
    try {
      data = await task;
    } catch (error) {
      throw this.report("geocoding", error);
    }
    if (this.addresses.size >= ADDRESS_CACHE_SIZE)
      this.addresses.delete(this.addresses.keys().next().value!);
    this.addresses.set(key, { expires: Date.now() + ADDRESS_TTL_MS, data });
    return this.geocodeResponse(normalized, data, autocomplete, false);
  }

  private geocodeResponse(
    query: string,
    suggestions: ResolvedAddress[],
    autocomplete: boolean,
    fromCache: boolean,
  ): GeocodeResponse {
    const response: GeocodeResponse = {
      query,
      suggestions,
      source: { ...GEOCODE_SOURCE, fromCache },
    };
    if (!autocomplete)
      response.resolution = !suggestions.length
        ? "none"
        : suggestions.length === 1 &&
            (suggestions[0].confidence ?? 0) >= UNIQUE_MATCH_CONFIDENCE
          ? "unique"
          : "ambiguous";
    return response;
  }

  /** All seven categories around a point. Identical concurrent requests share one provider run. */
  nearby(lat: number, lon: number, radius: number) {
    const key = `${SOURCE_KEY}:nearby:${DATA_VERSION}:${lat.toFixed(6)}:${lon.toFixed(6)}:${radius}`;
    const existing = this.running.get(key);
    if (existing) return existing;
    const task = this.resolveNearby(lat, lon, radius, key).finally(() =>
      this.running.delete(key),
    );
    this.running.set(key, task);
    return task;
  }

  private async resolveNearby(
    lat: number,
    lon: number,
    radius: number,
    key: string,
  ): Promise<NearbyPlacesResponse> {
    const cached = await this.prisma.sourceCache.findUnique({
      where: { cacheKey: key },
    });
    if (cached && cached.expiresAt > new Date())
      return cached.payload as unknown as NearbyPlacesResponse;
    try {
      return await this.load(lat, lon, radius, key);
    } catch (error) {
      const failure = this.report("places", error);
      if (cached && Date.now() - cached.fetchedAt.getTime() < STALE_LIMIT_MS)
        return {
          ...(cached.payload as unknown as NearbyPlacesResponse),
          stale: true,
        };
      throw failure;
    }
  }

  private async load(lat: number, lon: number, radius: number, key: string) {
    if (!process.env.GEOAPIFY_API_KEY?.trim()) throw missingKey();
    const groups = Object.keys(PLACE_GROUPS) as PlaceCategory[];
    const loaded = new Map<PlaceCategory, CategoryResult>();
    const failed = new Map<PlaceCategory, LocationProviderException>();
    /** A missing key or an exhausted quota hits every category; no point in trying the rest. */
    let fatal: LocationProviderException | undefined;
    for (let i = 0; i < groups.length; i += MAX_CONCURRENT_PROVIDER_REQUESTS) {
      await Promise.all(
        groups
          .slice(i, i + MAX_CONCURRENT_PROVIDER_REQUESTS)
          .map(async (group) => {
            const memoKey = `${key}:${group}`;
            const memo = this.categoryMemo.get(memoKey);
            if (memo && memo.expires > Date.now()) {
              loaded.set(group, memo.result);
              return;
            }
            if (fatal) {
              failed.set(group, fatal);
              return;
            }
            try {
              const result = await this.places.searchNearby(
                lat,
                lon,
                radius,
                group,
              );
              loaded.set(group, result);
              this.remember(memoKey, result);
            } catch (error) {
              const failure = toLocationException(error);
              failed.set(group, failure);
              if (failure.code === "NOT_CONFIGURED" || failure.code === "QUOTA")
                fatal = failure;
            }
          }),
      );
    }
    if (!loaded.size) throw mostRelevant([...failed.values()]);

    const statuses: Partial<Record<PlaceCategory, CategoryStatus>> = {};
    const issues: CategoryIssue[] = [];
    for (const group of groups) {
      const failure = failed.get(group);
      if (failure) {
        statuses[group] = "unavailable";
        issues.push({ category: group, reason: issueReason(failure) });
      } else if (loaded.get(group)?.truncated) {
        statuses[group] = "truncated";
        issues.push({ category: group, reason: "limit" });
      }
    }
    const places = deduplicate(
      [...loaded.values()].flatMap((result) => result.places),
    );
    const now = new Date();
    const data: NearbyPlacesResponse = {
      center: { latitude: lat, longitude: lon },
      radius,
      places,
      metrics: locationMetrics(places, radius, statuses),
      fetchedAt: now.toISOString(),
      stale: false,
      incomplete: issues.map((issue) => issue.category),
      issues,
      attribution: LOCATION_ATTRIBUTION,
    };
    // A capped category is a stable provider answer and may be cached; a failed one must be retried.
    if (failed.size) return data;
    await this.store(key, data, now);
    for (const group of groups) this.categoryMemo.delete(`${key}:${group}`);
    return data;
  }

  private remember(key: string, result: CategoryResult) {
    if (this.categoryMemo.size >= CATEGORY_MEMO_SIZE)
      this.categoryMemo.delete(this.categoryMemo.keys().next().value!);
    this.categoryMemo.set(key, {
      expires: Date.now() + CATEGORY_MEMO_TTL_MS,
      result,
    });
  }

  private async store(key: string, data: NearbyPlacesResponse, now: Date) {
    const payload = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
    await this.prisma.externalSource.upsert({
      where: { key: SOURCE_KEY },
      create: {
        key: SOURCE_KEY,
        displayName: "Geoapify / OpenStreetMap",
        type: "GEODATA",
        baseUrl: "https://api.geoapify.com",
        termsUrl: "https://www.geoapify.com/terms-and-conditions/",
        license: "ODbL",
        refreshIntervalSeconds: CACHE_TTL_MS / 1000,
        attribution: data.attribution,
      },
      update: {},
    });
    await this.prisma.sourceCache.upsert({
      where: { cacheKey: key },
      create: {
        cacheKey: key,
        sourceKey: SOURCE_KEY,
        payload,
        fetchedAt: now,
        expiresAt,
        licenseSnapshot: "ODbL",
        attribution: data.attribution,
      },
      update: { payload, fetchedAt: now, expiresAt },
    });
    // Entries past the stale limit are useless; removing them also keeps no long-term trail of checked locations.
    if (now.getTime() - this.lastCleanup > CLEANUP_INTERVAL_MS) {
      this.lastCleanup = now.getTime();
      await this.prisma.sourceCache
        .deleteMany({
          where: {
            sourceKey: SOURCE_KEY,
            fetchedAt: { lt: new Date(now.getTime() - STALE_LIMIT_MS) },
          },
        })
        .catch(() => undefined);
    }
  }

  /** Logs the kind of failure only: never the query text, the coordinates or the provider URL. */
  private report(operation: string, error: unknown): LocationProviderException {
    const failure = toLocationException(error);
    this.logger.warn(`Geoapify ${operation} failed: ${failure.code}`);
    return failure;
  }
}
