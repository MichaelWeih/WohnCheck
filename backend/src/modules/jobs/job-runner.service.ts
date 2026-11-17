import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { BackgroundJob, JobStatus, Prisma } from "@prisma/client";
import { redactSecrets } from "../../common/http/outbound-redaction";
import { PrismaService } from "../prisma/prisma.service";
import { JobHandlerRegistryImpl } from "./job-handler-registry.service";
import {
  DEFAULT_HANDLER_TIMEOUT_MS,
  MAX_RESCHEDULES,
  buildFencingToken,
  computeRetryDelayMs,
  sanitizeErrorMessage,
  serializeJobJson,
} from "./job-policy";
import {
  JobContext,
  JobContinuation,
  JobHandler,
  JobHandlerRegistry,
  NonRetryableJobError,
  RescheduleJobError,
} from "./job.types";
import { JobsConfig } from "./jobs.config";

/**
 * Why a run's signal was aborted.
 * - timeout:    the handler exceeded its time limit            -> treated as a failed attempt
 * - lease_lost: the lease could not be renewed (reaper took it) -> outcome discarded
 * - cancelled:  an admin cancelled the job                      -> outcome discarded
 * - shutdown:   the process is stopping                         -> job released without consuming an attempt
 */
type AbortReason = "timeout" | "lease_lost" | "cancelled" | "shutdown";

type RunOutcome =
  | { kind: "returned"; value: unknown }
  | { kind: "threw"; error: unknown }
  | { kind: "interrupted"; reason: AbortReason };

interface ActiveRun {
  job: BackgroundJob;
  /** Fencing token of this claim (BackgroundJob.lockedBy). */
  token: string;
  controller: AbortController;
  /** First reason the signal was aborted for; null while the handler runs undisturbed. */
  abortReason: AbortReason | null;
  /** Ends the wait for the handler: the run is finished with this reason even if the handler never settles. */
  stopWaiting(reason: AbortReason): void;
  /** Resolves when the run (including its finishing write) is over. */
  finished: Promise<void>;
  isFinished: boolean;
  /** Latest progress as JSON text and whether it still has to be written (progress writes are throttled). */
  latestProgress: string | null;
  progressDirty: boolean;
  lastProgressWriteAt: number;
}

/** Everything a finishing write needs to identify the claim it belongs to. */
interface Claim {
  job: BackgroundJob;
  token: string;
}

const UNLOCK = Prisma.sql`"lockedBy" = NULL, "lockExpiresAt" = NULL, "updatedAt" = now()`;

/**
 * Claims jobs and executes them (state machine: job.types.ts). Used by the polling worker and by
 * JobQueueService.drain(). Ownership of a job is carried only by the row (status / lockedBy / lockExpiresAt),
 * never by an open transaction: every statement here is a single autocommit statement on the database clock.
 */
@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger("Jobs");
  private readonly instanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private readonly active = new Map<string, ActiveRun>();
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JobHandlerRegistry) private readonly registry: JobHandlerRegistryImpl,
    private readonly config: JobsConfig,
  ) {}

  /** True once shutdown has begun: nothing is claimed any more. */
  get isStopping(): boolean {
    return this.stopping;
  }

  /**
   * Claims the next due job (highest priority, then earliest runAt) or returns null.
   * SKIP LOCKED lets concurrent claimers pass each other; the outer status check guards the rare case in
   * which the row was changed between the sub-select's snapshot and the update.
   */
  async claim(types?: string[]): Promise<BackgroundJob | null> {
    if (this.stopping) return null;

    const token = buildFencingToken(this.instanceId);
    const typeFilter = types ? Prisma.sql`AND "type" = ANY(${types}::text[])` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<BackgroundJob[]>`
      UPDATE "BackgroundJob" SET
        "status" = ${JobStatus.RUNNING}::"JobStatus",
        "attempts" = "attempts" + 1,
        "lockedAt" = now(),
        "lockExpiresAt" = now() + (${this.config.leaseMs}::int * interval '1 millisecond'),
        "lockedBy" = ${token},
        "updatedAt" = now()
      WHERE "id" = (
        SELECT "id" FROM "BackgroundJob"
        WHERE "status" = ${JobStatus.QUEUED}::"JobStatus" AND "runAt" <= now() ${typeFilter}
        ORDER BY "priority" DESC, "runAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      AND "status" = ${JobStatus.QUEUED}::"JobStatus"
      RETURNING *`;

    return rows[0] ?? null;
  }

  /** True when at least one QUEUED job (of the given types) is due right now. */
  async hasDueJob(types?: string[]): Promise<boolean> {
    const typeFilter = types ? Prisma.sql`AND "type" = ANY(${types}::text[])` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ due: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "BackgroundJob"
        WHERE "status" = ${JobStatus.QUEUED}::"JobStatus" AND "runAt" <= now() ${typeFilter}
      ) AS "due"`;

    return rows[0]?.due === true;
  }

  /**
   * Executes a job returned by claim() and writes its outcome. Never throws.
   * Returns false when no handler was invoked (unknown job type).
   */
  async run(job: BackgroundJob): Promise<boolean> {
    const token = job.lockedBy;

    if (!token) {
      this.logger.error(`Job ${job.id} (${job.type}) was passed to the runner without a claim; ignored.`);
      return false;
    }

    if (this.stopping) {
      // The claim was already on its way when shutdown began: hand the job back instead of starting a handler
      // that nobody would abort or wait for any more.
      try {
        await this.finish({ job, token }, this.releaseWrite({ job, token }, null), "released for shutdown");
      } catch (error) {
        this.logger.error(`[${job.type} ${job.id}] could not release the job: ${sanitizeErrorMessage(error)}`);
      }

      return false;
    }

    const handler = this.registry.getHandler(job.type);

    if (!handler) {
      const message = `No handler is registered for job type "${job.type}".`;

      this.logger.error(`[${job.type} ${job.id}] ${message}`);

      try {
        await this.finish({ job, token }, this.deadWrite({ job, token }, message, null), "dead letter");
      } catch (error) {
        this.logger.error(`[${job.type} ${job.id}] could not store the outcome: ${sanitizeErrorMessage(error)}`);
      }

      return false;
    }

    let markFinished: () => void = () => undefined;
    let stopWaiting: (reason: AbortReason) => void = () => undefined;
    const interrupted = new Promise<RunOutcome>((resolve) => {
      stopWaiting = (reason) => resolve({ kind: "interrupted", reason });
    });
    const run: ActiveRun = {
      job,
      token,
      controller: new AbortController(),
      abortReason: null,
      stopWaiting,
      finished: new Promise<void>((resolve) => {
        markFinished = resolve;
      }),
      isFinished: false,
      latestProgress: null,
      progressDirty: false,
      lastProgressWriteAt: Number.NEGATIVE_INFINITY,
    };
    const timeoutMs = handler.timeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;

    this.active.set(token, run);

    const renewTimer = setInterval(() => void this.renewLease(run), this.config.leaseRenewMs);
    const timeoutTimer = setTimeout(() => this.abortRun(run, "timeout"), timeoutMs);

    try {
      const outcome = await Promise.race([this.invoke(handler, run), interrupted]);
      await this.applyOutcome(run, outcome, timeoutMs);
    } catch (error) {
      // Only reachable through a failed finishing write; the lease expires and the reaper recovers the job.
      this.logger.error(`[${job.type} ${job.id}] could not store the outcome: ${sanitizeErrorMessage(error)}`);
    } finally {
      clearInterval(renewTimer);
      clearTimeout(timeoutTimer);
      run.isFinished = true;
      this.active.delete(token);
      markFinished();
    }

    return true;
  }

  /** Aborts a job that is running in THIS process (admin cancel). Other instances notice at their next lease renewal. */
  abortLocal(jobId: string, reason: "cancelled"): void {
    for (const run of this.active.values()) {
      if (run.job.id === jobId) this.abortRun(run, reason);
    }
  }

  /**
   * Recovers RUNNING jobs whose lease expired (crashed or stalled worker): back to QUEUED with the retry
   * backoff, or DEAD when the attempts are used up. Returns the number of recovered jobs.
   */
  async reapExpiredLeases(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; type: string; status: JobStatus }>>`
      UPDATE "BackgroundJob" SET
        "status" = CASE WHEN "attempts" >= "maxAttempts"
          THEN ${JobStatus.DEAD}::"JobStatus" ELSE ${JobStatus.QUEUED}::"JobStatus" END,
        "activeDedupeKey" = CASE WHEN "attempts" >= "maxAttempts" THEN NULL ELSE "activeDedupeKey" END,
        "rerunRequested" = CASE WHEN "attempts" >= "maxAttempts" THEN false ELSE "rerunRequested" END,
        "runAt" = CASE WHEN "attempts" >= "maxAttempts" THEN "runAt"
          ELSE now() + LEAST(30 * power(2, LEAST(GREATEST("attempts" - 1, 0), 30)), 3600)
                       * (0.8 + random() * 0.4) * interval '1 second' END,
        "finishedAt" = CASE WHEN "attempts" >= "maxAttempts" THEN now() ELSE NULL END,
        "lastError" = 'Lease expired: the worker stopped renewing it (crash or stall).',
        ${UNLOCK}
      WHERE "status" = ${JobStatus.RUNNING}::"JobStatus" AND "lockExpiresAt" < now()
      RETURNING "id", "type", "status"`;

    for (const row of rows) {
      this.logger.warn(`[${row.type} ${row.id}] lease expired; job is now ${row.status}.`);
    }

    return rows.length;
  }

  /**
   * Graceful shutdown: stop claiming, abort every running handler, wait up to the grace period for them to
   * settle and release whatever is still running (QUEUED at now, attempt not consumed).
   */
  async shutdown(): Promise<void> {
    this.stopping = true;

    const runs = [...this.active.values()];

    if (runs.length === 0) return;

    for (const run of runs) {
      this.abortRun(run, "shutdown");
    }

    const allFinished = Promise.all(runs.map((run) => run.finished));
    let graceTimer: NodeJS.Timeout | undefined;
    const graceOver = new Promise<"grace_over">((resolve) => {
      graceTimer = setTimeout(() => resolve("grace_over"), this.config.shutdownGraceMs);
    });
    const first = await Promise.race([allFinished.then(() => "finished" as const), graceOver]);

    clearTimeout(graceTimer);

    if (first === "grace_over") {
      for (const run of runs) {
        if (!run.isFinished) {
          this.logger.warn(`[${run.job.type} ${run.job.id}] did not stop within the grace period; releasing the job.`);
          run.stopWaiting("shutdown");
        }
      }

      await allFinished;
    }
  }

  /** Calls the handler; synchronous throws and rejections both become an outcome value. */
  private invoke(handler: JobHandler, run: ActiveRun): Promise<RunOutcome> {
    const context: JobContext = {
      jobId: run.job.id,
      attempt: run.job.attempts,
      signal: run.controller.signal,
      log: (message) => this.logger.log(`[${run.job.type} ${run.job.id}] ${redactSecrets(message)}`),
      reportProgress: (progress) => this.reportProgress(run, progress),
    };

    return Promise.resolve()
      .then(() => handler.handle(run.job.payload, context))
      .then(
        (value): RunOutcome => ({ kind: "returned", value }),
        (error: unknown): RunOutcome => ({ kind: "threw", error }),
      );
  }

  /**
   * Aborts the run's signal. For every reason except shutdown the runner also stops waiting for the handler
   * (a handler that ignores the signal must not block the slot); on shutdown it keeps waiting until the
   * handler settles or the grace period ends.
   */
  private abortRun(run: ActiveRun, reason: AbortReason): void {
    if (run.isFinished) return;

    if (run.abortReason === null) run.abortReason = reason;

    run.controller.abort();

    if (reason !== "shutdown") run.stopWaiting(reason);
  }

  private async renewLease(run: ActiveRun): Promise<void> {
    if (run.isFinished) return;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "BackgroundJob" SET
          "lockExpiresAt" = now() + (${this.config.leaseMs}::int * interval '1 millisecond'),
          "updatedAt" = now()
        WHERE ${this.fence(run)}
        RETURNING "id"`;

      if (rows.length === 0) this.abortRun(run, "lease_lost");
    } catch (error) {
      // Transient database trouble: try again at the next tick. If the lease really expires, the reaper
      // re-queues the job and the next successful renewal attempt finds the fencing token gone.
      this.logger.warn(`[${run.job.type} ${run.job.id}] lease renewal failed: ${sanitizeErrorMessage(error)}`);
    }
  }

  private async reportProgress(run: ActiveRun, progress: Record<string, unknown>): Promise<void> {
    if (run.isFinished) return;

    run.latestProgress = serializeJobJson(progress);
    run.progressDirty = true;

    const now = Date.now();

    // Throttled: the latest value is kept in memory and written with the next allowed write or the finishing write.
    if (now - run.lastProgressWriteAt < this.config.progressThrottleMs) return;

    run.lastProgressWriteAt = now;
    run.progressDirty = false;

    try {
      await this.prisma.$executeRaw`
        UPDATE "BackgroundJob" SET "progress" = ${run.latestProgress}::jsonb, "updatedAt" = now()
        WHERE ${this.fence(run)}`;
    } catch (error) {
      // Progress is informational only; a failed write must not fail the handler.
      run.progressDirty = true;
      this.logger.warn(`[${run.job.type} ${run.job.id}] progress write failed: ${sanitizeErrorMessage(error)}`);
    }
  }

  /** Maps the outcome of a run to the finishing write of the state machine. */
  private async applyOutcome(run: ActiveRun, outcome: RunOutcome, timeoutMs: number): Promise<void> {
    const { job } = run;
    const prefix = `[${job.type} ${job.id}]`;
    const pendingProgress = run.progressDirty ? run.latestProgress : null;

    if (outcome.kind === "interrupted") {
      if (outcome.reason === "lease_lost" || outcome.reason === "cancelled") {
        // The row belongs to someone else now (or is CANCELLED); nothing may be written.
        this.logger.warn(`${prefix} stopped (${outcome.reason}); outcome discarded.`);
        return;
      }

      // A timeout that fires while the process is already shutting down is not the handler's fault either.
      if (outcome.reason === "shutdown" || run.abortReason === "shutdown") {
        await this.finish(run, this.releaseWrite(run, pendingProgress), "released for shutdown");
        return;
      }

      const message = `Handler timed out after ${timeoutMs} ms.`;

      this.logger.warn(`${prefix} ${message}`);
      await this.finish(run, this.failureWrite(run, message, pendingProgress), "failed");
      return;
    }

    if (outcome.kind === "returned") {
      if (outcome.value instanceof JobContinuation) {
        const progress = outcome.value.progress !== undefined ? serializeJobJson(outcome.value.progress) : pendingProgress;

        await this.finish(run, this.continuationWrite(run, outcome.value.runAt, progress), "continued");
        return;
      }

      await this.finish(run, this.successWrite(run, serializeJobJson(outcome.value), pendingProgress), "succeeded");
      return;
    }

    if (run.abortReason === "lease_lost" || run.abortReason === "cancelled") {
      this.logger.warn(`${prefix} stopped (${run.abortReason}); outcome discarded.`);
      return;
    }

    if (run.abortReason === "shutdown") {
      // Whatever the handler threw after the abort is a consequence of the shutdown, not a failure of the job.
      await this.finish(run, this.releaseWrite(run, pendingProgress), "released for shutdown");
      return;
    }

    const message = sanitizeErrorMessage(outcome.error);

    if (outcome.error instanceof RescheduleJobError) {
      this.logger.log(`${prefix} rescheduled: ${message}`);
      await this.finish(run, this.rescheduleWrite(run, outcome.error.runAt, message, pendingProgress), "rescheduled");
      return;
    }

    if (outcome.error instanceof NonRetryableJobError) {
      this.logger.error(`${prefix} failed permanently: ${message}`);
      await this.finish(run, this.deadWrite(run, message, pendingProgress), "dead letter");
      return;
    }

    this.logger.warn(`${prefix} attempt ${job.attempts} of ${job.maxAttempts} failed: ${message}`);
    await this.finish(run, this.failureWrite(run, message, pendingProgress), "failed");
  }

  /**
   * Executes a finishing write. Every such write is fenced by the claim's token; when it matches no row the
   * lease was lost in the meantime and the outcome is discarded.
   */
  private async finish(claim: Claim, write: Prisma.Sql, description: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ status: JobStatus }>>(write);

    if (rows.length === 0) {
      this.logger.warn(`[${claim.job.type} ${claim.job.id}] lease lost before the outcome (${description}) was stored; discarded.`);
    }
  }

  /** WHERE clause shared by every write of a run: the row must still be RUNNING under this claim's token. */
  private fence(claim: Claim): Prisma.Sql {
    return Prisma.sql`"id" = ${claim.job.id} AND "lockedBy" = ${claim.token} AND "status" = ${JobStatus.RUNNING}::"JobStatus"`;
  }

  /** SUCCEEDED, or back to QUEUED once when a trigger arrived mid-run (rerunRequested). */
  private successWrite(claim: Claim, result: string | null, progress: string | null): Prisma.Sql {
    return Prisma.sql`
      UPDATE "BackgroundJob" SET
        "status" = CASE WHEN "rerunRequested"
          THEN ${JobStatus.QUEUED}::"JobStatus" ELSE ${JobStatus.SUCCEEDED}::"JobStatus" END,
        "activeDedupeKey" = CASE WHEN "rerunRequested" THEN "activeDedupeKey" ELSE NULL END,
        "runAt" = CASE WHEN "rerunRequested" THEN now() ELSE "runAt" END,
        "attempts" = CASE WHEN "rerunRequested" THEN 0 ELSE "attempts" END,
        "rescheduleCount" = CASE WHEN "rerunRequested" THEN 0 ELSE "rescheduleCount" END,
        "finishedAt" = CASE WHEN "rerunRequested" THEN NULL ELSE now() END,
        "rerunRequested" = false,
        "result" = ${result}::jsonb,
        "progress" = COALESCE(${progress}::jsonb, "progress"),
        "lastError" = NULL,
        ${UNLOCK}
      WHERE ${this.fence(claim)}
      RETURNING "status"`;
  }

  /** Same row again at `runAt` with a fresh attempt counter; the dedupe key stays held. */
  private continuationWrite(claim: Claim, runAt: Date, progress: string | null): Prisma.Sql {
    const validRunAt = runAt instanceof Date && !Number.isNaN(runAt.getTime()) ? runAt : null;

    return Prisma.sql`
      UPDATE "BackgroundJob" SET
        "status" = ${JobStatus.QUEUED}::"JobStatus",
        "runAt" = COALESCE(${validRunAt}::timestamptz, now()),
        "attempts" = 0,
        "progress" = COALESCE(${progress}::jsonb, "progress"),
        "lastError" = NULL,
        ${UNLOCK}
      WHERE ${this.fence(claim)}
      RETURNING "status"`;
  }

  /** Upstream asked us to wait: not a failure, but bounded so a job cannot be postponed forever. */
  private rescheduleWrite(claim: Claim, runAt: Date, message: string, progress: string | null): Prisma.Sql {
    const validRunAt = runAt instanceof Date && !Number.isNaN(runAt.getTime()) ? runAt : null;
    const deadMessage = sanitizeErrorMessage(`rescheduled too often: ${message}`);

    return Prisma.sql`
      UPDATE "BackgroundJob" SET
        "status" = CASE WHEN "rescheduleCount" + 1 > ${MAX_RESCHEDULES}::int
          THEN ${JobStatus.DEAD}::"JobStatus" ELSE ${JobStatus.QUEUED}::"JobStatus" END,
        "activeDedupeKey" = CASE WHEN "rescheduleCount" + 1 > ${MAX_RESCHEDULES}::int THEN NULL ELSE "activeDedupeKey" END,
        "rerunRequested" = CASE WHEN "rescheduleCount" + 1 > ${MAX_RESCHEDULES}::int THEN false ELSE "rerunRequested" END,
        "runAt" = CASE WHEN "rescheduleCount" + 1 > ${MAX_RESCHEDULES}::int THEN "runAt"
          ELSE GREATEST(COALESCE(${validRunAt}::timestamptz, now()), now()) END,
        "finishedAt" = CASE WHEN "rescheduleCount" + 1 > ${MAX_RESCHEDULES}::int THEN now() ELSE NULL END,
        "lastError" = CASE WHEN "rescheduleCount" + 1 > ${MAX_RESCHEDULES}::int THEN ${deadMessage} ELSE ${message} END,
        "attempts" = GREATEST("attempts" - 1, 0),
        "rescheduleCount" = "rescheduleCount" + 1,
        "progress" = COALESCE(${progress}::jsonb, "progress"),
        ${UNLOCK}
      WHERE ${this.fence(claim)}
      RETURNING "status"`;
  }

  /** Shutdown: hand the job back untouched so another worker (or the restarted one) picks it up at once. */
  private releaseWrite(claim: Claim, progress: string | null): Prisma.Sql {
    return Prisma.sql`
      UPDATE "BackgroundJob" SET
        "status" = ${JobStatus.QUEUED}::"JobStatus",
        "runAt" = now(),
        "attempts" = GREATEST("attempts" - 1, 0),
        "progress" = COALESCE(${progress}::jsonb, "progress"),
        ${UNLOCK}
      WHERE ${this.fence(claim)}
      RETURNING "status"`;
  }

  /** Dead letter without further retries (non-retryable error, unknown job type). */
  private deadWrite(claim: Claim, message: string, progress: string | null): Prisma.Sql {
    return Prisma.sql`
      UPDATE "BackgroundJob" SET
        "status" = ${JobStatus.DEAD}::"JobStatus",
        "activeDedupeKey" = NULL,
        "rerunRequested" = false,
        "lastError" = ${message},
        "progress" = COALESCE(${progress}::jsonb, "progress"),
        "finishedAt" = now(),
        ${UNLOCK}
      WHERE ${this.fence(claim)}
      RETURNING "status"`;
  }

  /** Failed attempt: retry with backoff, or DEAD when the attempts are used up. */
  private failureWrite(claim: Claim, message: string, progress: string | null): Prisma.Sql {
    const delayMs = computeRetryDelayMs(claim.job.attempts);

    return Prisma.sql`
      UPDATE "BackgroundJob" SET
        "status" = CASE WHEN "attempts" >= "maxAttempts"
          THEN ${JobStatus.DEAD}::"JobStatus" ELSE ${JobStatus.QUEUED}::"JobStatus" END,
        "activeDedupeKey" = CASE WHEN "attempts" >= "maxAttempts" THEN NULL ELSE "activeDedupeKey" END,
        "rerunRequested" = CASE WHEN "attempts" >= "maxAttempts" THEN false ELSE "rerunRequested" END,
        "runAt" = CASE WHEN "attempts" >= "maxAttempts" THEN "runAt"
          ELSE now() + (${delayMs}::int * interval '1 millisecond') END,
        "finishedAt" = CASE WHEN "attempts" >= "maxAttempts" THEN now() ELSE NULL END,
        "lastError" = ${message},
        "progress" = COALESCE(${progress}::jsonb, "progress"),
        ${UNLOCK}
      WHERE ${this.fence(claim)}
      RETURNING "status"`;
  }
}
