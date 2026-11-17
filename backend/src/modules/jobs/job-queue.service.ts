import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BackgroundJob, JobStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_MAX_ATTEMPTS } from "./job-policy";
import { JobRunnerService } from "./job-runner.service";
import { EnqueueOptions, EnqueueResult, JobQueueService } from "./job.types";

/** How often enqueue / requeue re-check when the holder of a dedupe key vanished between two statements. */
const DEDUPE_ROUNDS = 5;
/** Safety net of drain(): a handler that continues itself forever must not hang a test or CLI run. */
const DRAIN_DEFAULT_MAX_RUNS = 10_000;

type RawClient = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Postgres-backed implementation of the queue contract (job.types.ts). */
@Injectable()
export class JobQueueServiceImpl implements JobQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: JobRunnerService,
  ) {}

  /**
   * Creates a job, or returns the active job that already holds the dedupe key.
   * The insert is ONE statement arbitrated by the unique index on "activeDedupeKey", so concurrent callers
   * (also inside their own transactions) can never create two active jobs with the same key and never
   * see a unique-constraint error.
   */
  async enqueue<T>(options: EnqueueOptions<T>, tx?: Prisma.TransactionClient): Promise<EnqueueResult> {
    const db: RawClient = tx ?? this.prisma;
    const type = options.type?.trim();

    if (!type) {
      throw new Error("enqueue() needs a job type.");
    }

    const payload = JSON.stringify(options.payload ?? {});

    if (payload === undefined) {
      throw new Error(`The payload of job type "${type}" is not JSON-serialisable.`);
    }

    const dedupeKey = options.dedupeKey ?? null;
    const runAt = options.runAt instanceof Date && !Number.isNaN(options.runAt.getTime()) ? options.runAt : null;
    const priority = Number.isInteger(options.priority) ? (options.priority as number) : 0;
    const maxAttempts =
      Number.isInteger(options.maxAttempts) && (options.maxAttempts as number) >= 1
        ? (options.maxAttempts as number)
        : DEFAULT_MAX_ATTEMPTS;

    for (let round = 0; round < DEDUPE_ROUNDS; round++) {
      const inserted = await db.$queryRaw<BackgroundJob[]>`
        INSERT INTO "BackgroundJob"
          ("id", "type", "payload", "status", "priority", "dedupeKey", "activeDedupeKey", "runAt", "maxAttempts",
           "createdAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${type}, ${payload}::jsonb, ${JobStatus.QUEUED}::"JobStatus", ${priority}::int,
           ${dedupeKey}, ${dedupeKey}, COALESCE(${runAt}::timestamptz, now()), ${maxAttempts}::int, now(), now())
        ON CONFLICT ("activeDedupeKey") DO NOTHING
        RETURNING *`;

      if (inserted.length > 0) {
        return { job: inserted[0], deduplicated: false };
      }

      // Only reachable with a dedupe key: NULL keys never conflict.
      const holder = await this.findActiveHolder(db, dedupeKey as string, options.rerunIfRunning === true);

      if (holder) {
        return { job: holder, deduplicated: true };
      }

      // The holder finished between the two statements, so the key is free again: insert once more.
    }

    throw new Error(`Could not enqueue job type "${type}": its dedupe key kept changing hands.`);
  }

  /** QUEUED / RUNNING -> CANCELLED (dedupe key released). A handler running in this process is aborted at once. */
  async cancel(jobId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "BackgroundJob" SET
        "status" = ${JobStatus.CANCELLED}::"JobStatus",
        "activeDedupeKey" = NULL,
        "rerunRequested" = false,
        "lockedBy" = NULL,
        "lockExpiresAt" = NULL,
        "finishedAt" = now(),
        "updatedAt" = now()
      WHERE "id" = ${jobId}
        AND "status" IN (${JobStatus.QUEUED}::"JobStatus", ${JobStatus.RUNNING}::"JobStatus")
      RETURNING "id"`;

    // Clearing lockedBy fences off the running handler wherever it runs: its finishing write matches no row
    // and its next lease renewal aborts it. In this process there is no need to wait for that.
    if (rows.length > 0) {
      this.runner.abortLocal(jobId, "cancelled");
    }
  }

  /**
   * DEAD -> QUEUED with fresh counters. When another active job holds the dedupe key meanwhile, the dead job
   * stays as it is and the active one is returned (`deduplicated: true`).
   * Throws NotFoundException for an unknown id and ConflictException for a job that is not DEAD.
   */
  async requeueDead(jobId: string): Promise<EnqueueResult> {
    for (let round = 0; round < DEDUPE_ROUNDS; round++) {
      let revived: BackgroundJob[];

      try {
        revived = await this.prisma.$queryRaw<BackgroundJob[]>`
          UPDATE "BackgroundJob" AS job SET
            "status" = ${JobStatus.QUEUED}::"JobStatus",
            "activeDedupeKey" = job."dedupeKey",
            "attempts" = 0,
            "rescheduleCount" = 0,
            "rerunRequested" = false,
            "runAt" = now(),
            "finishedAt" = NULL,
            "lockedBy" = NULL,
            "lockExpiresAt" = NULL,
            "updatedAt" = now()
          WHERE job."id" = ${jobId}
            AND job."status" = ${JobStatus.DEAD}::"JobStatus"
            AND (
              job."dedupeKey" IS NULL
              OR NOT EXISTS (SELECT 1 FROM "BackgroundJob" AS holder WHERE holder."activeDedupeKey" = job."dedupeKey")
            )
          RETURNING *`;
      } catch (error) {
        // An UPDATE cannot say ON CONFLICT DO NOTHING: when a concurrent enqueue took the key after the
        // NOT EXISTS check, the unique index rejects the statement. The next round then finds that holder.
        if (isUniqueViolation(error)) continue;

        throw error;
      }

      if (revived.length > 0) {
        return { job: revived[0], deduplicated: false };
      }

      const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });

      if (!job) {
        throw new NotFoundException("Job nicht gefunden.");
      }

      if (job.status !== JobStatus.DEAD) {
        throw new ConflictException("Nur Jobs im Status DEAD können erneut eingereiht werden.");
      }

      const holder = job.dedupeKey ? await this.findActiveHolder(this.prisma, job.dedupeKey, false) : null;

      if (holder) {
        return { job: holder, deduplicated: true };
      }
    }

    throw new Error(`Could not requeue job ${jobId}: its dedupe key kept changing hands.`);
  }

  /**
   * Runs due jobs one after the other in this process until none is due (or `maxRuns` handler runs were made).
   * Works with the polling worker disabled. Returns the number of handler runs.
   */
  async drain(options: { types?: string[]; maxRuns?: number } = {}): Promise<number> {
    const maxRuns = options.maxRuns ?? DRAIN_DEFAULT_MAX_RUNS;
    let runs = 0;

    while (runs < maxRuns && !this.runner.isStopping) {
      const job = await this.runner.claim(options.types);

      if (!job) {
        // An empty claim can also mean that a concurrent claimer got in the way; only stop when nothing is due.
        if (this.runner.isStopping || !(await this.runner.hasDueJob(options.types))) break;

        continue;
      }

      if (await this.runner.run(job)) runs += 1;
    }

    return runs;
  }

  /**
   * The active job holding `dedupeKey`, or null when the key is free. With `rerunIfRunning` a RUNNING holder
   * is flagged in the same statement that reads it, so the flag cannot miss a holder that finishes concurrently:
   * its finishing write either sees the flag or has already released the key (then this returns null).
   */
  private async findActiveHolder(db: RawClient, dedupeKey: string, rerunIfRunning: boolean): Promise<BackgroundJob | null> {
    if (rerunIfRunning) {
      const flagged = await db.$queryRaw<BackgroundJob[]>`
        UPDATE "BackgroundJob" SET "rerunRequested" = true, "updatedAt" = now()
        WHERE "activeDedupeKey" = ${dedupeKey} AND "status" = ${JobStatus.RUNNING}::"JobStatus"
        RETURNING *`;

      if (flagged.length > 0) return flagged[0];
    }

    const holders = await db.$queryRaw<BackgroundJob[]>`
      SELECT * FROM "BackgroundJob" WHERE "activeDedupeKey" = ${dedupeKey}`;

    return holders[0] ?? null;
  }
}

/** True for a Postgres unique violation (SQLSTATE 23505) surfaced by Prisma from a raw statement or the ORM. */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;

  if (error.code === "P2002") return true;

  return error.code === "P2010" && (error.meta as { code?: unknown } | undefined)?.code === "23505";
}
