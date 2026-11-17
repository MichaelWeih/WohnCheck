/**
 * CONTRACT of the shared outbound HTTP client. EVERY call to an external data source goes through
 * `OutboundHttpService` — providers must not call `fetch` themselves. Politeness rules are enforced
 * in one place and cannot be overridden per request:
 *
 * - Only hosts registered with `registerHost()` can be contacted, https only, no IP literals.
 *   Redirects are not followed automatically (a redirect is returned as-is to the caller).
 * - Per-host spacing and an optional daily budget, persisted in table OutboundHostState so they hold
 *   across instances and restarts.
 * - A descriptive User-Agent (OUTBOUND_USER_AGENT, with contact info from OUTBOUND_CONTACT).
 * - Timeouts, a response size cap, and at most a few short retries on network errors / 5xx.
 * - 429 / 503: NOT retried in-call. The host is blocked until Retry-After (persisted) and an
 *   OutboundHttpError with `kind: "rate_limited"` and `retryAt` is thrown — job handlers convert it
 *   into a RescheduleJobError.
 *
 * It must never be used to work around access restrictions (no header spoofing, no captcha handling,
 * no rotating identities). 401 / 403 are reported to the caller, never bypassed.
 */

export interface OutboundHostPolicy {
  /** Exact host name, e.g. "api.gleif.org". */
  host: string;
  /** Minimum time between two request starts to this host. */
  minIntervalMs: number;
  /** Requests per UTC day; undefined = unlimited (free, keyless APIs only). */
  dailyBudget?: number;
  /** Upper bound for an accepted Retry-After; longer waits are capped to this (default 3600). */
  maxRetryAfterSeconds?: number;
}

export interface OutboundRequest {
  url: string;
  method?: "GET" | "POST";
  /** Header names are sent as given; credentials belong in headers, never in the URL. */
  headers?: Record<string, string>;
  /** Sent as-is (string) — callers encode form / JSON bodies themselves. */
  body?: string;
  /** Default 20 000 ms. */
  timeoutMs?: number;
  /** Default 10 MB; a larger response throws OutboundHttpError kind "too_large". */
  maxResponseBytes?: number;
  /** Statuses returned to the caller instead of thrown (e.g. [404]). 2xx is always returned. */
  acceptStatuses?: number[];
  /** Retries on network errors and 5xx (except 503); default 2, with short backoff. */
  retries?: number;
  /** Pass the job's `ctx.signal` so shutdown is not blocked by a pending request. */
  signal?: AbortSignal;
}

export interface OutboundResponse {
  status: number;
  /** Header names lower-cased. */
  headers: Record<string, string>;
  text: string;
}

export type OutboundErrorKind =
  /** Host not registered, not https, IP literal. */
  | "blocked"
  /** 429 / 503 from upstream, or the host is currently blocked from an earlier one. See `retryAt`. */
  | "rate_limited"
  /** Daily budget of the host used up. See `retryAt` (next UTC day). */
  | "budget"
  | "timeout"
  | "network"
  | "too_large"
  /** Any other non-accepted HTTP status. */
  | "http"
  | "aborted";

/** `url` and `message` are redacted (no query strings with secrets, no userinfo). */
export class OutboundHttpError extends Error {
  constructor(
    message: string,
    public readonly kind: OutboundErrorKind,
    public readonly url: string,
    /** HTTP status, or 0 when no response was received. */
    public readonly status: number,
    /** For kinds "rate_limited" and "budget": earliest sensible time to try again. */
    public readonly retryAt?: Date,
  ) {
    super(message);
    this.name = "OutboundHttpError";
  }
}

export abstract class OutboundHttpService {
  /** Call in onModuleInit of the module that owns the provider. Re-registering the same host keeps the stricter policy. */
  abstract registerHost(policy: OutboundHostPolicy): void;
  abstract request(request: OutboundRequest): Promise<OutboundResponse>;
  /** Convenience: GET + JSON.parse; throws OutboundHttpError kind "http" when the body is not JSON. */
  abstract getJson<T = unknown>(url: string, options?: Omit<OutboundRequest, "url" | "method" | "body">): Promise<T>;
}

/**
 * Test double seam: OutboundHttpServiceImpl takes its transport from this token, so tests can replace
 * the network with a stub (`{ provide: OUTBOUND_FETCH, useValue: fakeFetch }`). Default: global fetch.
 */
export const OUTBOUND_FETCH = "OUTBOUND_FETCH";
export type OutboundFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect: "manual" }) => Promise<{
  status: number;
  headers: { forEach(callback: (value: string, key: string) => void): void };
  text(): Promise<string>;
}>;
