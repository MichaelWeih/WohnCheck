import { BackgroundJob, Prisma } from "@prisma/client";

/**
 * CONTRACT of the Postgres-backed job queue (tables BackgroundJob, JobSchedule).
 * The abstract classes below are the Nest DI tokens; JobsModule (global) binds and exports them.
 *
 * Usage from another module:
 *
 *   constructor(private readonly jobs: JobQueueService, private readonly registry: JobHandlerRegistry) {}
 *
 *   onModuleInit() {
 *     this.registry.register({ type: "discovery.sync-source", handle: (payload, ctx) => this.run(payload, ctx) });
 *     this.registry.registerSchedule({ key: "discovery.sync:wikidata:default", type: "discovery.sync-source",
 *       payload: { sourceKey: "wikidata", scope: "default" }, dedupeKey: "discovery.sync:wikidata:default",
 *       intervalMinutes: 1440, network: true });
 *   }
 *
 *   await this.jobs.enqueue({ type: "discovery.sync-source", payload: { sourceKey: "wikidata", scope: "default" },
 *                             dedupeKey: "discovery.sync:wikidata:default" });
 *
 * GUARANTEES
 * - At-least-once execution: handlers MUST be idempotent.
 * - Dedupe: while a job with the same `dedupeKey` is QUEUED or RUNNING, `enqueue` returns that job
 *   (`deduplicated: true`) instead of creating a new one. Never throws on duplicates.
 * - Bounded units: a handler processes ONE bounded slice (about <= 20 s or <= 500 records) and returns.
 *   To continue it returns a `JobContinuation` (same job row, dedupe key kept).
 * - Lease: the WORKER renews the job's lease while the handler runs and aborts `ctx.signal` when the lease
 *   is lost. Handlers never deal with locks.
 * - Crash safety: RUNNING jobs whose lease expired are re-queued by the reaper (or go DEAD when attempts are used up).
 *
 * STATE MACHINE (implemented by the worker; every finishing write is fenced by `lockedBy`)
 *   claim                      attempts += 1, status RUNNING, lease 60 s (renewed every 20 s)
 *   handler returns a result   SUCCEEDED (or back to QUEUED once if rerunRequested)
 *   returns JobContinuation    QUEUED at continuation.runAt, attempts = 0, progress stored
 *   throws RescheduleJobError  QUEUED at max(runAt, now), attempts -= 1, rescheduleCount += 1;
 *                              rescheduleCount > 20 => DEAD ("rescheduled too often")
 *   signal aborted (shutdown)  QUEUED at now, attempts -= 1
 *   throws NonRetryableJobError DEAD
 *   other error / lease lost   attempts >= maxAttempts ? DEAD
 *                              : QUEUED at now + min(30 s * 2^(attempts-1), 1 h) +/- 20 % jitter
 *   admin requeue of DEAD      QUEUED, attempts = 0, rescheduleCount = 0
 * `activeDedupeKey` equals `dedupeKey` exactly while status IN (QUEUED, RUNNING) and is cleared in the same
 * UPDATE that sets SUCCEEDED, DEAD or CANCELLED (enforced by a DB CHECK constraint).
 *
 * PRIVACY: payloads carry ids only. `result`, `progress`, thrown error messages and `ctx.log` must never
 * contain user search text, personal data or URLs with credentials. `lastError` is truncated to 2000 chars,
 * `result` larger than 8 KB is replaced by `{ truncated: true }`.
 */

export interface EnqueueOptions<TPayload = unknown> {
  type: string;
  payload?: TPayload;
  /** See dedupe semantics above. */
  dedupeKey?: string;
  /**
   * Only with `dedupeKey`: if the active job with this key is already RUNNING, run it once more after it
   * finishes (so a trigger that arrives mid-run is not lost). Use for event-triggered jobs, not for schedules.
   */
  rerunIfRunning?: boolean;
  /** Earliest execution time; default: now. */
  runAt?: Date;
  /** Higher runs first; default 0. Interactive jobs (search-on-miss) use 10. */
  priority?: number;
  /** Default 5. */
  maxAttempts?: number;
}

export interface EnqueueResult {
  job: BackgroundJob;
  /** True when an active job with the same dedupeKey already existed and was returned instead. */
  deduplicated: boolean;
}

export interface JobContext {
  /** Id of the running job (for change-log attribution). */
  jobId: string;
  /** 1-based attempt number. */
  attempt: number;
  /** Aborted on shutdown or when the lease is lost. Pass it to OutboundHttpService and check it between steps. */
  signal: AbortSignal;
  /** Log line (Nest logger, prefixed with job type + id). Must not contain personal data or search text. */
  log(message: string): void;
  /** Stores small progress counters for /admin/jobs (throttled to one write per 5 s). */
  reportProgress(progress: Record<string, unknown>): Promise<void>;
}

/** Return from `handle()` to run the same job again (same row, dedupe key kept, attempts reset). */
export class JobContinuation {
  constructor(
    public readonly runAt: Date = new Date(),
    public readonly progress?: Record<string, unknown>,
  ) {}
}

export interface JobHandler<TPayload = unknown, TResult = unknown> {
  /** Unique job type, namespaced by module: "discovery.sync-source", "topics.analyze-pending", ... */
  type: string;
  /** Hard time limit for one run; the worker aborts `ctx.signal` and treats it as an error. Default 120 000 ms. */
  timeoutMs?: number;
  /** Result must be JSON-serialisable and small. */
  handle(payload: TPayload, ctx: JobContext): Promise<TResult | JobContinuation>;
}

/** Throw to send the job straight to DEAD without further retries (e.g. invalid payload). */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}

/** Throw when an upstream told us to wait (rate limit / Retry-After): run again at `runAt`, not counted as a failure. */
export class RescheduleJobError extends Error {
  constructor(
    message: string,
    public readonly runAt: Date,
  ) {
    super(message);
    this.name = "RescheduleJobError";
  }
}

export interface ScheduleDefinition {
  /** Stable key, e.g. "discovery.sync:wikidata:default". */
  key: string;
  type: string;
  payload?: unknown;
  /** Dedupe key used for the enqueued job — the same key manual triggers of the same work use. */
  dedupeKey: string;
  /** Default interval; an existing row's interval / enabled flag (admin-configured) is NOT overwritten. */
  intervalMinutes: number;
  /**
   * True when the job contacts external services. Such schedules are created DISABLED unless
   * DISCOVERY_AUTO_SYNC=true, so starting the backend never causes network crawling by itself.
   */
  network?: boolean;
  priority?: number;
  maxAttempts?: number;
}

export abstract class JobQueueService {
  /**
   * Pass `tx` to enqueue atomically with the caller's writes (the job becomes visible on commit).
   * Implemented as a single INSERT ... ON CONFLICT DO NOTHING, so it is safe inside a transaction.
   */
  abstract enqueue<T>(options: EnqueueOptions<T>, tx?: Prisma.TransactionClient): Promise<EnqueueResult>;
  /** QUEUED -> CANCELLED. A RUNNING job is aborted and cancelled. No-op for finished jobs. */
  abstract cancel(jobId: string): Promise<void>;
  /** DEAD -> QUEUED (attempts reset). Returns the already active job when the dedupe key is taken. */
  abstract requeueDead(jobId: string): Promise<EnqueueResult>;
  /**
   * Test / CLI helper: runs due jobs in-process until none is due, regardless of JOBS_WORKER_ENABLED.
   * Returns the number of handler runs.
   */
  abstract drain(options?: { types?: string[]; maxRuns?: number }): Promise<number>;
}

export abstract class JobHandlerRegistry {
  /** Call in onModuleInit. Throws when the type is already registered. */
  abstract register(handler: JobHandler): void;
  /** Call in onModuleInit. Creates the JobSchedule row on application bootstrap if it does not exist. */
  abstract registerSchedule(definition: ScheduleDefinition): void;
}

/** Job types owned by the jobs module itself. */
export const JOBS_JOBS = {
  /** payload: {} — deletes SUCCEEDED / CANCELLED jobs older than JOBS_RETENTION_DAYS. Local only. */
  CLEANUP: "jobs.cleanup",
} as const;
