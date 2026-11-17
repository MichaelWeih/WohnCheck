import { DiscoveredCompany } from "../companies/company.types";

/**
 * CONTRACT for discovery sources. Adding a source = one SOURCE_CATALOG entry + one class implementing
 * `DiscoveryProvider`, registered in DiscoveryModule. No schema or pipeline change needed.
 *
 * Providers only fetch and map. They never write to the database; the pipeline passes every
 * `DiscoveredCompany` to CompanyResolverService and persists cursor / watermark in SourceSyncState.
 * Network access only through OutboundHttpService (hosts registered by the provider's module).
 * Licence, attribution and priority live in SOURCE_CATALOG (common/sources), keyed by `key`.
 */
export interface DiscoveryProvider {
  /** Source key; must exist in SOURCE_CATALOG. */
  readonly key: string;

  /**
   * False when the provider cannot run (not listed in DISCOVERY_SOURCES, missing file, missing config).
   * `disabledReason()` then explains why in German (shown in the admin UI).
   */
  isEnabled(): boolean;
  disabledReason(): string | null;

  /**
   * Scopes this source is synced in, each with its own sync state
   * (["default"], or e.g. one scope per federal state / per search keyword).
   */
  listScopes(): string[];

  /**
   * Bulk sync: fetch ONE bounded page (<= 500 records, ideally one upstream request) of a scope.
   *
   * - `request.mode` "FULL": enumerate everything. "INCREMENTAL": only records changed since `request.watermark`.
   * - `request.cursor` is the `nextCursor` of the previous page of the SAME run (undefined on the first page).
   * - Must be safe to call again with the same arguments (idempotent re-import).
   * - When `done` is true the run is complete; the pipeline then stores the run's START time as the new
   *   watermark (never the end time, so changes during the crawl are not missed) unless the provider
   *   returns its own `watermark`.
   */
  fetchPage(request: DiscoveryPageRequest, signal: AbortSignal): Promise<DiscoveryPage>;

  /**
   * Targeted lookup for search-on-miss: companies whose name matches `query` (already normalised
   * company-name text, >= 3 characters). Optional — sources without a search API do not implement it.
   * At most 5 upstream requests and at most 10 results. Must throw (not return []) when the upstream failed,
   * so an outage is never cached as "not found".
   */
  searchByName?(query: string, signal: AbortSignal): Promise<DiscoveredCompany[]>;
}

export interface DiscoveryPageRequest {
  scope: string;
  mode: "FULL" | "INCREMENTAL";
  /** Opaque position inside the current run. */
  cursor: unknown | undefined;
  /** Opaque starting point of an incremental run (from the last completed run); undefined if none. */
  watermark: unknown | undefined;
  /** Start time of the current run. */
  runStartedAt: Date;
}

export interface DiscoveryPage {
  records: DiscoveredCompany[];
  /** Opaque, JSON-serialisable. */
  nextCursor: unknown;
  /** True when the scope is fully processed for this run. */
  done: boolean;
  /** Optional provider-defined watermark to store when `done` (default: the run's start time as ISO string). */
  watermark?: unknown;
}

/** Job types owned by the discovery module. */
export const DISCOVERY_JOBS = {
  /** payload: { sourceKey: string; scope: string; mode?: "FULL" } — one page per run, continues via JobContinuation. */
  SYNC_SOURCE: "discovery.sync-source",
  /** payload: { discoveryQueryId: string } — never the query text. */
  SEARCH_ON_MISS: "discovery.search-on-miss",
  /** payload: {} — deletes expired DiscoveryQuery rows and clears stale clear-text queries. Local only. */
  PURGE_QUERIES: "discovery.purge-queries",
} as const;

/** Dedupe key for a sync of one source scope — used by schedules AND manual admin triggers. */
export function syncDedupeKey(sourceKey: string, scope: string): string {
  return `discovery.sync:${sourceKey}:${scope}`;
}
