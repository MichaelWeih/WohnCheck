import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { JobSchedule, JobStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JobHandlerRegistryImpl } from "./job-handler-registry.service";
import { JobHandlerRegistry, JobQueueService, JOBS_JOBS } from "./job.types";
import { JobsConfig } from "./jobs.config";

/**
 * Persists the registered schedule definitions and enqueues due schedules (docs/vermieter-verzeichnis.md 4).
 * - A schedule is claimed atomically (UPDATE ... WHERE nextRunAt <= now() AND enabled RETURNING) and enqueued
 *   with its dedupe key, so several instances never enqueue the same run twice. Missed runs are not caught up.
 * - Network schedules are created DISABLED unless DISCOVERY_AUTO_SYNC=true: a fresh backend never crawls by itself.
 * - Admin-configured interval / enabled flags of existing rows are never overwritten.
 * Also owns the local `jobs.cleanup` job.
 */
@Injectable()
export class JobSchedulerService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("JobScheduler");
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JobHandlerRegistry) private readonly registry: JobHandlerRegistryImpl,
    private readonly queue: JobQueueService,
    private readonly config: JobsConfig,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      type: JOBS_JOBS.CLEANUP,
      handle: async () => {
        const result = await this.prisma.backgroundJob.deleteMany({
          where: {
            status: { in: [JobStatus.SUCCEEDED, JobStatus.CANCELLED] },
            updatedAt: { lt: new Date(Date.now() - this.config.retentionDays * 86_400_000) },
          },
        });
        return { deleted: result.count };
      },
    });
    this.registry.registerSchedule({
      key: JOBS_JOBS.CLEANUP,
      type: JOBS_JOBS.CLEANUP,
      dedupeKey: JOBS_JOBS.CLEANUP,
      intervalMinutes: 1440,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.persistDefinitions();
    } catch (error) {
      this.logger.error(`Could not persist job schedules: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    if (!this.config.schedulerEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.schedulerTickMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async persistDefinitions(): Promise<void> {
    for (const definition of this.registry.listSchedules()) {
      await this.prisma.jobSchedule.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          type: definition.type,
          payload: (definition.payload ?? {}) as object,
          dedupeKey: definition.dedupeKey,
          intervalMinutes: definition.intervalMinutes,
          network: Boolean(definition.network),
          enabled: definition.network ? this.config.networkSchedulesEnabledByDefault : true,
          priority: definition.priority ?? 0,
          maxAttempts: definition.maxAttempts ?? 5,
        },
        // Keep admin settings (interval, enabled); refresh only what the code defines.
        update: {
          type: definition.type,
          payload: (definition.payload ?? {}) as object,
          dedupeKey: definition.dedupeKey,
          network: Boolean(definition.network),
        },
      });
    }
  }

  /** Claims every due schedule and enqueues its job. Returns the number of enqueued schedules. */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const claimed = await this.prisma.$queryRaw<JobSchedule[]>`
        UPDATE "JobSchedule"
        SET "nextRunAt" = now() + ("intervalMinutes" * interval '1 minute'),
            "lastEnqueuedAt" = now(),
            "updatedAt" = now()
        WHERE "enabled" AND "nextRunAt" <= now()
        RETURNING *`;
      for (const schedule of claimed) {
        if (!this.registry.getHandler(schedule.type)) continue;
        await this.queue.enqueue({
          type: schedule.type,
          payload: schedule.payload,
          dedupeKey: schedule.dedupeKey,
          priority: schedule.priority,
          maxAttempts: schedule.maxAttempts,
        });
      }
      return claimed.length;
    } catch (error) {
      this.logger.warn(`Schedule tick failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }
}
