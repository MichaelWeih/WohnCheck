import { randomUUID } from "node:crypto";
import { redactSecrets } from "../../common/http/outbound-redaction";

/** Default of JobHandler.timeoutMs. */
export const DEFAULT_HANDLER_TIMEOUT_MS = 120_000;
/** Default of EnqueueOptions.maxAttempts. */
export const DEFAULT_MAX_ATTEMPTS = 5;
/** A job that was rescheduled more often than this goes DEAD ("rescheduled too often"). */
export const MAX_RESCHEDULES = 20;
/** BackgroundJob.lastError is cut to this many characters. */
export const MAX_ERROR_LENGTH = 2_000;
/** BackgroundJob.result / progress larger than this (UTF-8 bytes of the JSON) are replaced by `{ truncated: true }`. */
export const MAX_RESULT_BYTES = 8 * 1024;

const RETRY_BASE_DELAY_MS = 30_000;
const RETRY_MAX_DELAY_MS = 60 * 60 * 1000;
const RETRY_JITTER = 0.2;

/**
 * Delay before the next attempt after a failed run: min(30 s * 2^(attempts-1), 1 h) +/- 20 % jitter.
 * `attempts` is the number of runs so far (1 after the first failure). The jitter spreads retries of jobs
 * that failed together (e.g. during an outage) so they do not hit the upstream at the same instant again.
 */
export function computeRetryDelayMs(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, Math.trunc(attempts) - 1);
  // Cap the exponent as well: 2^1024 would overflow to Infinity before the minimum is taken.
  const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.min(exponent, 30), RETRY_MAX_DELAY_MS);
  const factor = 1 - RETRY_JITTER + random() * 2 * RETRY_JITTER;

  return Math.round(base * factor);
}

/** Text stored in BackgroundJob.lastError: message of the thrown value, credentials masked, at most 2000 characters. */
export function sanitizeErrorMessage(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "Job failed with a non-error value.";
  }

  const redacted = redactSecrets(message).trim() || "Job failed without an error message.";

  return redacted.length > MAX_ERROR_LENGTH ? redacted.slice(0, MAX_ERROR_LENGTH) : redacted;
}

/**
 * JSON text for the jsonb columns `result` and `progress`, or null when there is nothing to store.
 * Oversized values become `{ "truncated": true }`; values JSON cannot represent are dropped (null).
 */
export function serializeJobJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  let json: string | undefined;

  try {
    json = JSON.stringify(value);
  } catch {
    return null;
  }

  if (json === undefined) return null;

  return Buffer.byteLength(json, "utf8") > MAX_RESULT_BYTES ? JSON.stringify({ truncated: true }) : json;
}

const PAYLOAD_PREVIEW_MAX_KEYS = 10;
const PAYLOAD_PREVIEW_MAX_TEXT = 80;

export type PayloadPreview = Record<string, string | number | boolean | null>;

/**
 * Short, safe projection of a job payload for /admin/jobs: top-level keys only (at most 10), strings
 * redacted and cut to 80 characters, nested values reduced to a size marker. Payloads carry ids only by
 * contract; the projection makes sure the admin API cannot leak more even if a module violates that.
 */
export function projectPayload(payload: unknown): PayloadPreview {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {};
  }

  const preview: PayloadPreview = {};

  for (const [key, value] of Object.entries(payload).slice(0, PAYLOAD_PREVIEW_MAX_KEYS)) {
    const name = key.slice(0, PAYLOAD_PREVIEW_MAX_TEXT);

    if (value === null || typeof value === "number" || typeof value === "boolean") {
      preview[name] = value;
    } else if (typeof value === "string") {
      const text = redactSecrets(value);
      preview[name] = text.length > PAYLOAD_PREVIEW_MAX_TEXT ? `${text.slice(0, PAYLOAD_PREVIEW_MAX_TEXT)}…` : text;
    } else if (Array.isArray(value)) {
      preview[name] = `[${value.length} Einträge]`;
    } else {
      preview[name] = "[Objekt]";
    }
  }

  return preview;
}

/** Fencing token of one claim: "<instanceId>:<uuid per claim>". */
export function buildFencingToken(instanceId: string): string {
  return `${instanceId}:${randomUUID()}`;
}
