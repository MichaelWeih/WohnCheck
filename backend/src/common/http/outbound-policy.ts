import * as fs from "node:fs";
import { isIP } from "node:net";
import * as path from "node:path";
import { OutboundHostPolicy } from "./outbound-http.types";

/** Product token of the User-Agent; the version is the backend package version. */
export const USER_AGENT_PRODUCT = "WohnCheckBot";
/** Placeholder the specification prescribes when OUTBOUND_CONTACT is not set. */
export const CONTACT_NOT_CONFIGURED = "contact not configured";
/**
 * Wikimedia throttles clients without contact information to 10 requests per minute.
 * 7 s between request starts stays below that tier.
 */
export const WIKIMEDIA_ANONYMOUS_MIN_INTERVAL_MS = 7_000;
/** Default cap for an accepted Retry-After (OutboundHostPolicy.maxRetryAfterSeconds). */
export const DEFAULT_MAX_RETRY_AFTER_SECONDS = 3_600;
/** Wait applied after a 429 / 503 that carries no usable Retry-After header. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

const HOST_NAME_PATTERN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const WIKIMEDIA_DOMAINS = ["wikidata.org", "wikimedia.org", "wikipedia.org"];

/** True for IPv4 / IPv6 literals as they appear in `URL.hostname` (IPv6 in brackets). */
export function isIpLiteral(hostname: string): boolean {
  return hostname.startsWith("[") || isIP(hostname) !== 0;
}

/** True for wikidata.org, wikimedia.org, wikipedia.org and their subdomains. */
export function isWikimediaHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return WIKIMEDIA_DOMAINS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

/**
 * Validates a policy passed to registerHost() and returns it with a lower-cased host.
 * Throws on anything that is not a plain DNS host name (no scheme, port, path or IP literal) or on
 * nonsensical limits, because a wrong registration is a programming error that must not go unnoticed.
 */
export function normalizeHostPolicy(policy: OutboundHostPolicy): OutboundHostPolicy {
  const host = policy.host.trim().toLowerCase();

  if (!HOST_NAME_PATTERN.test(host) || isIpLiteral(host)) {
    throw new Error(`Invalid outbound host "${policy.host}": expected a plain DNS host name such as "api.gleif.org".`);
  }

  if (!Number.isFinite(policy.minIntervalMs) || policy.minIntervalMs < 0) {
    throw new Error(`Invalid minIntervalMs for outbound host "${host}".`);
  }

  if (policy.dailyBudget !== undefined && (!Number.isInteger(policy.dailyBudget) || policy.dailyBudget < 0)) {
    throw new Error(`Invalid dailyBudget for outbound host "${host}".`);
  }

  if (
    policy.maxRetryAfterSeconds !== undefined &&
    (!Number.isFinite(policy.maxRetryAfterSeconds) || policy.maxRetryAfterSeconds < 0)
  ) {
    throw new Error(`Invalid maxRetryAfterSeconds for outbound host "${host}".`);
  }

  return {
    host,
    minIntervalMs: Math.ceil(policy.minIntervalMs),
    dailyBudget: policy.dailyBudget,
    maxRetryAfterSeconds: policy.maxRetryAfterSeconds,
  };
}

/**
 * Combines two registrations of the same host so that the stricter (more polite) value of every limit wins:
 * the longer spacing, the smaller daily budget and the longer accepted Retry-After.
 */
export function mergeHostPolicies(current: OutboundHostPolicy, incoming: OutboundHostPolicy): OutboundHostPolicy {
  const budgets = [current.dailyBudget, incoming.dailyBudget].filter((value): value is number => value !== undefined);

  return {
    host: current.host,
    minIntervalMs: Math.max(current.minIntervalMs, incoming.minIntervalMs),
    dailyBudget: budgets.length > 0 ? Math.min(...budgets) : undefined,
    maxRetryAfterSeconds: Math.max(
      current.maxRetryAfterSeconds ?? DEFAULT_MAX_RETRY_AFTER_SECONDS,
      incoming.maxRetryAfterSeconds ?? DEFAULT_MAX_RETRY_AFTER_SECONDS,
    ),
  };
}

/** Spacing actually enforced for a host: the policy's interval, raised for Wikimedia hosts without a contact. */
export function effectiveMinIntervalMs(policy: OutboundHostPolicy, contactConfigured: boolean): number {
  if (!contactConfigured && isWikimediaHost(policy.host)) {
    return Math.max(policy.minIntervalMs, WIKIMEDIA_ANONYMOUS_MIN_INTERVAL_MS);
  }

  return policy.minIntervalMs;
}

export type OutboundUrlCheck = { ok: true; url: URL; host: string } | { ok: false; reason: string };

/**
 * The URL gate of the outbound client: https only, no credentials in the URL, no IP literals,
 * default port only and the host must have been registered. The reason never contains the URL.
 */
export function checkOutboundUrl(raw: string, isRegistered: (host: string) => boolean): OutboundUrlCheck {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "the URL is invalid" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "only https URLs are allowed" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials in the URL are not allowed" };
  }

  const host = url.hostname.toLowerCase();

  if (isIpLiteral(host)) {
    return { ok: false, reason: "IP literals are not allowed" };
  }

  // A policy is registered per host name; another port is another service that nobody registered.
  if (url.port !== "") {
    return { ok: false, reason: "only the default https port is allowed" };
  }

  if (!isRegistered(host)) {
    return { ok: false, reason: `host "${host}" is not registered` };
  }

  return { ok: true, url, host };
}

/**
 * Parses a Retry-After header value: delay in seconds or an HTTP-date. Returns the wait in whole seconds
 * (0 for dates in the past) or null when the value is missing or malformed.
 */
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  // Date.parse accepts far more than HTTP-dates ("-5" is a year); every HTTP-date form contains a month name.
  if (!/[A-Za-z]{3}/.test(trimmed)) return null;

  const timestamp = Date.parse(trimmed);

  if (Number.isNaN(timestamp)) return null;

  return Math.max(0, Math.ceil((timestamp - nowMs) / 1000));
}

/**
 * Seconds a host stays blocked after a 429 / 503: the Retry-After value (default when absent), at least
 * one second (so a "Retry-After: 0" cannot cause a tight loop) and at most the policy's cap.
 */
export function resolveRetryAfterSeconds(
  headerValue: string | null | undefined,
  nowMs: number,
  maxRetryAfterSeconds: number = DEFAULT_MAX_RETRY_AFTER_SECONDS,
): number {
  const requested = parseRetryAfter(headerValue, nowMs) ?? DEFAULT_RETRY_AFTER_SECONDS;
  return Math.ceil(Math.min(Math.max(requested, 1), Math.max(maxRetryAfterSeconds, 1)));
}

/**
 * `WohnCheckBot/<version> (<contact>)`. Without a contact the fixed text "contact not configured" is sent.
 * Characters that could break out of the header or of the comment (control characters, parentheses) are removed.
 */
export function buildUserAgent(version: string, contact: string | null | undefined): string {
  const safeVersion = version.replace(/[^A-Za-z0-9.+-]/g, "") || "unknown";
  const safeContact = normalizeContact(contact) ?? CONTACT_NOT_CONFIGURED;

  return `${USER_AGENT_PRODUCT}/${safeVersion} (${safeContact})`;
}

/** Trimmed, header-safe OUTBOUND_CONTACT or null when nothing usable is configured. */
export function normalizeContact(contact: string | null | undefined): string | null {
  const cleaned = (contact ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned === "" ? null : cleaned;
}

/**
 * Version from the backend's package.json, found by walking up from `startDir` (the relative depth differs
 * between ts-jest / ts-node and the compiled `dist` tree). "unknown" when no package.json with a version exists.
 */
export function readBackendVersion(startDir: string = __dirname): string {
  let directory = startDir;

  for (;;) {
    const candidate = path.join(directory, "package.json");

    if (fs.existsSync(candidate)) {
      try {
        const version = (JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: unknown }).version;

        if (typeof version === "string" && version.trim() !== "") return version.trim();
      } catch {
        // Unreadable package.json: keep looking further up.
      }
    }

    const parent = path.dirname(directory);

    if (parent === directory) return "unknown";

    directory = parent;
  }
}
