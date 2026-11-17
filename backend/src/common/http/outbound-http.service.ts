import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../modules/prisma/prisma.service";
import {
  OUTBOUND_FETCH,
  OutboundErrorKind,
  OutboundFetch,
  OutboundHostPolicy,
  OutboundHttpError,
  OutboundHttpService,
  OutboundRequest,
  OutboundResponse,
} from "./outbound-http.types";
import {
  DEFAULT_MAX_RETRY_AFTER_SECONDS,
  buildUserAgent,
  checkOutboundUrl,
  effectiveMinIntervalMs,
  mergeHostPolicies,
  normalizeContact,
  normalizeHostPolicy,
  readBackendVersion,
  resolveRetryAfterSeconds,
} from "./outbound-policy";
import { describeUrl, redactUrl } from "./outbound-redaction";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_RETRIES = 2;
/** "At most a few short retries": callers cannot ask for more than this. */
const MAX_RETRIES = 3;
/** Pause before the first retry; doubled for every further one. */
const RETRY_BASE_DELAY_MS = 500;
/**
 * Added to the spacing stored per host. A slot is reserved on the database clock, but the request is sent a
 * few milliseconds later (query round trip, timers); the margin keeps the real distance between two request
 * starts at or above the configured minimum despite that jitter.
 */
const SLOT_SAFETY_MARGIN_MS = 50;

/** Internal marker thrown while reading a response body that exceeds the size cap. */
class ResponseTooLargeError extends Error {
  constructor(public readonly status: number) {
    super("response too large");
  }
}

type TransportResponse = Awaited<ReturnType<OutboundFetch>>;

interface AttemptFailure {
  kind: Extract<OutboundErrorKind, "network" | "http">;
  status: number;
  detail: string;
}

/**
 * Implementation of the shared outbound HTTP client (contract: outbound-http.types.ts).
 * All politeness state lives in table OutboundHostState, so spacing, budgets and upstream blocks hold
 * across service instances and restarts.
 */
@Injectable()
export class OutboundHttpServiceImpl implements OutboundHttpService {
  private readonly logger = new Logger("OutboundHttp");
  private readonly policies = new Map<string, OutboundHostPolicy>();
  private readonly userAgent: string;
  private readonly contactConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOUND_FETCH) private readonly transport: OutboundFetch,
  ) {
    const contact = normalizeContact(process.env.OUTBOUND_CONTACT);

    this.contactConfigured = contact !== null;
    this.userAgent = buildUserAgent(readBackendVersion(), contact);
  }

  /** Registers (or tightens) the policy of a host. Unregistered hosts cannot be contacted at all. */
  registerHost(policy: OutboundHostPolicy): void {
    const normalized = normalizeHostPolicy(policy);
    const current = this.policies.get(normalized.host);

    this.policies.set(normalized.host, current ? mergeHostPolicies(current, normalized) : normalized);
  }

  /** Performs one polite request; see the contract header for every rule enforced here. */
  async request(request: OutboundRequest): Promise<OutboundResponse> {
    const safeUrl = redactUrl(request.url);
    const check = checkOutboundUrl(request.url, (host) => this.policies.has(host));

    if (!check.ok) {
      throw new OutboundHttpError(`Outbound request blocked: ${check.reason}.`, "blocked", safeUrl, 0);
    }

    const policy = this.policies.get(check.host) as OutboundHostPolicy;
    const method = request.method ?? "GET";
    const label = `${method} ${describeUrl(request.url)}`;
    const retries = Math.min(Math.max(Math.trunc(request.retries ?? DEFAULT_RETRIES), 0), MAX_RETRIES);
    let failure: AttemptFailure | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      this.throwIfAborted(request.signal, label, safeUrl);

      if (attempt > 0) {
        await this.sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), request.signal, label, safeUrl);
      }

      // Retries are requests like any other: each one needs its own slot and counts against the budget.
      const waitMs = await this.reserveSlot(policy, label, safeUrl);
      await this.sleep(waitMs, request.signal, label, safeUrl);

      const outcome = await this.attempt(request, check.url.toString(), method, label, safeUrl);

      if ("failure" in outcome) {
        failure = outcome.failure;

        if (attempt < retries) {
          this.logger.warn(`${label} failed (${failure.detail}); retry ${attempt + 1} of ${retries}.`);
        }

        continue;
      }

      const { response } = outcome;

      if (response.status === 429 || response.status === 503) {
        // Never waited out or retried in-call, and not negotiable through acceptStatuses.
        const seconds = resolveRetryAfterSeconds(
          response.headers["retry-after"],
          Date.now(),
          policy.maxRetryAfterSeconds ?? DEFAULT_MAX_RETRY_AFTER_SECONDS,
        );
        const retryAt = await this.blockHost(policy.host, seconds);

        this.logger.warn(`${label} answered HTTP ${response.status}; host blocked until ${retryAt.toISOString()}.`);
        throw new OutboundHttpError(
          `${label} was rate limited (HTTP ${response.status}); retry after ${retryAt.toISOString()}.`,
          "rate_limited",
          safeUrl,
          response.status,
          retryAt,
        );
      }

      const accepted =
        (response.status >= 200 && response.status < 400) || (request.acceptStatuses ?? []).includes(response.status);

      if (accepted) return response;

      if (response.status >= 500) {
        failure = { kind: "http", status: response.status, detail: `HTTP ${response.status}` };

        if (attempt < retries) {
          this.logger.warn(`${label} failed (${failure.detail}); retry ${attempt + 1} of ${retries}.`);
        }

        continue;
      }

      throw new OutboundHttpError(
        `${label} failed with HTTP ${response.status}.`,
        "http",
        safeUrl,
        response.status,
      );
    }

    const last = failure as AttemptFailure;
    throw new OutboundHttpError(`${label} failed (${last.detail}).`, last.kind, safeUrl, last.status);
  }

  /** GET + JSON.parse. A body that is not JSON is reported as kind "http". */
  async getJson<T = unknown>(url: string, options: Omit<OutboundRequest, "url" | "method" | "body"> = {}): Promise<T> {
    const callerHeaders = options.headers ?? {};
    const hasAccept = Object.keys(callerHeaders).some((name) => name.toLowerCase() === "accept");
    const response = await this.request({
      ...options,
      url,
      method: "GET",
      headers: hasAccept ? callerHeaders : { Accept: "application/json", ...callerHeaders },
    });

    try {
      return JSON.parse(response.text) as T;
    } catch {
      throw new OutboundHttpError(
        `GET ${describeUrl(url)} did not return valid JSON (HTTP ${response.status}).`,
        "http",
        redactUrl(url),
        response.status,
      );
    }
  }

  /**
   * Reserves the next free request slot of the host and returns how long to wait for it.
   * The row is created once (INSERT ... ON CONFLICT DO NOTHING); the reservation itself is ONE UPDATE that
   * checks block and budget and moves `nextAllowedAt` forward, so concurrent callers (also in other
   * processes) always get distinct slots. Everything is evaluated on the database clock.
   */
  private async reserveSlot(policy: OutboundHostPolicy, label: string, safeUrl: string): Promise<number> {
    const interval = effectiveMinIntervalMs(policy, this.contactConfigured);
    const spacingMs = interval > 0 ? interval + SLOT_SAFETY_MARGIN_MS : 0;
    const budget = policy.dailyBudget ?? null;

    // Two rounds: a block can expire between the failed reservation and the look at the reason.
    for (let round = 0; round < 2; round++) {
      await this.prisma.$executeRaw`
        INSERT INTO "OutboundHostState" ("host", "nextAllowedAt", "updatedAt")
        VALUES (${policy.host}, now(), now())
        ON CONFLICT ("host") DO NOTHING`;

      const reserved = await this.prisma.$queryRaw<Array<{ waitMs: number }>>`
        UPDATE "OutboundHostState" SET
          "nextAllowedAt" = GREATEST("nextAllowedAt", now()) + (${spacingMs}::int * interval '1 millisecond'),
          "day" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
          "requestsToday" = CASE
            WHEN "day" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') THEN "requestsToday" + 1
            ELSE 1
          END,
          "blockedUntil" = NULL,
          "updatedAt" = now()
        WHERE "host" = ${policy.host}
          AND ("blockedUntil" IS NULL OR "blockedUntil" <= now())
          AND (
            ${budget}::int IS NULL
            OR (CASE WHEN "day" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') THEN "requestsToday" ELSE 0 END)
               < ${budget}::int
          )
        RETURNING (EXTRACT(EPOCH FROM ("nextAllowedAt" - now())) * 1000 - ${spacingMs}::int)::float8 AS "waitMs"`;

      if (reserved.length > 0) return Math.max(0, reserved[0].waitMs);

      const [state] = await this.prisma.$queryRaw<Array<{ blockedUntil: Date | null; blocked: boolean; nextUtcDay: Date }>>`
        SELECT
          "blockedUntil",
          ("blockedUntil" IS NOT NULL AND "blockedUntil" > now()) AS "blocked",
          ((date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC') AS "nextUtcDay"
        FROM "OutboundHostState"
        WHERE "host" = ${policy.host}`;

      if (state?.blocked && state.blockedUntil) {
        throw new OutboundHttpError(
          `${label} not sent: host is rate limited until ${state.blockedUntil.toISOString()}.`,
          "rate_limited",
          safeUrl,
          0,
          state.blockedUntil,
        );
      }

      if (state && budget !== null) {
        throw new OutboundHttpError(
          `${label} not sent: daily budget of ${budget} requests for ${policy.host} is used up.`,
          "budget",
          safeUrl,
          0,
          state.nextUtcDay,
        );
      }
    }

    throw new OutboundHttpError(`${label} not sent: no request slot available.`, "rate_limited", safeUrl, 0, new Date());
  }

  /** Persists an upstream block (429 / 503). An existing longer block is kept. Returns the end of the block. */
  private async blockHost(host: string, seconds: number): Promise<Date> {
    const rows = await this.prisma.$queryRaw<Array<{ blockedUntil: Date }>>`
      UPDATE "OutboundHostState" SET
        "blockedUntil" = GREATEST(COALESCE("blockedUntil", now()), now() + (${seconds}::int * interval '1 second')),
        "updatedAt" = now()
      WHERE "host" = ${host}
      RETURNING "blockedUntil"`;

    // The row always exists here (the slot reservation created it); the fallback only guards manual deletes.
    return rows[0]?.blockedUntil ?? new Date(Date.now() + seconds * 1000);
  }

  /** One request / response exchange with timeout, abort handling and the size cap. */
  private async attempt(
    request: OutboundRequest,
    url: string,
    method: "GET" | "POST",
    label: string,
    safeUrl: string,
  ): Promise<{ response: OutboundResponse } | { failure: AttemptFailure }> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = request.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();

    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const exchange = (async () => {
        const raw = await this.transport(url, {
          method,
          headers: this.buildHeaders(request.headers),
          body: request.body,
          signal: controller.signal,
          redirect: "manual",
        });
        const headers: Record<string, string> = {};

        raw.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        return { status: raw.status, headers, text: await readBody(raw, headers, maxBytes) };
      })();

      // Raced against the abort signal so that a transport ignoring the signal cannot hang the caller.
      return { response: await raceAbort(exchange, controller.signal) };
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        throw new OutboundHttpError(
          `${label} failed: response is larger than ${maxBytes} bytes.`,
          "too_large",
          safeUrl,
          error.status,
        );
      }

      if (request.signal?.aborted) {
        throw new OutboundHttpError(`${label} was aborted.`, "aborted", safeUrl, 0);
      }

      if (timedOut) {
        // Not retried: another full timeout would exceed the bounded slice of a job handler.
        throw new OutboundHttpError(`${label} timed out after ${timeoutMs} ms.`, "timeout", safeUrl, 0);
      }

      return { failure: { kind: "network", status: 0, detail: `network error ${networkErrorCode(error)}` } };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  /** Caller headers as given, except User-Agent: the identity of the client cannot be changed per request. */
  private buildHeaders(callerHeaders: Record<string, string> | undefined): Record<string, string> {
    const headers: Record<string, string> = {};

    for (const [name, value] of Object.entries(callerHeaders ?? {})) {
      if (name.toLowerCase() !== "user-agent") headers[name] = value;
    }

    headers["User-Agent"] = this.userAgent;
    return headers;
  }

  private throwIfAborted(signal: AbortSignal | undefined, label: string, safeUrl: string): void {
    if (signal?.aborted) {
      throw new OutboundHttpError(`${label} was aborted.`, "aborted", safeUrl, 0);
    }
  }

  /** Abortable wait (slot spacing, retry backoff). */
  private sleep(ms: number, signal: AbortSignal | undefined, label: string, safeUrl: string): Promise<void> {
    this.throwIfAborted(signal, label, safeUrl);

    if (ms <= 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new OutboundHttpError(`${label} was aborted.`, "aborted", safeUrl, 0));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, Math.ceil(ms));

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

/** Rejects as soon as the signal aborts; the losing promise is silenced so it cannot become an unhandled rejection. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));

    if (signal.aborted) {
      promise.catch(() => undefined);
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Reads the body with a hard size cap. When the transport exposes a byte stream (the global fetch does),
 * reading stops as soon as the cap is exceeded; otherwise the text is read and measured afterwards.
 */
async function readBody(response: TransportResponse, headers: Record<string, string>, maxBytes: number): Promise<string> {
  const declaredLength = Number(headers["content-length"]);

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ResponseTooLargeError(response.status);
  }

  const stream = (response as { body?: unknown }).body;

  if (isByteStream(stream)) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ResponseTooLargeError(response.status);
      }

      chunks.push(value);
    }

    return new TextDecoder().decode(Buffer.concat(chunks));
  }

  const text = await response.text();

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ResponseTooLargeError(response.status);
  }

  return text;
}

function isByteStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof value === "object" && value !== null && typeof (value as { getReader?: unknown }).getReader === "function";
}

/** Short machine code of a transport error (e.g. ECONNRESET). The message is not used: it may contain the URL. */
function networkErrorCode(error: unknown): string {
  const candidates = [(error as { cause?: { code?: unknown } })?.cause?.code, (error as { code?: unknown })?.code];
  const code = candidates.find((value): value is string => typeof value === "string" && /^[A-Z0-9_]+$/.test(value));

  if (code) return code;

  return error instanceof Error && /^[A-Za-z]+$/.test(error.name) ? error.name : "unknown";
}
