import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobHandlerRegistryImpl } from "./job-handler-registry.service";
import { JobQueueServiceImpl } from "./job-queue.service";
import { JobRunnerService } from "./job-runner.service";
import { JobSchedulerService } from "./job-scheduler.service";
import { JobWorkerService } from "./job-worker.service";
import { JobHandlerRegistry, JobQueueService } from "./job.types";
import { JobsConfig, loadJobsConfig } from "./jobs.config";

/**
 * Postgres-backed job queue, worker and scheduler (contract: job.types.ts).
 * Global: every module can inject JobQueueService and JobHandlerRegistry.
 * JOBS_WORKER_ENABLED / JOBS_SCHEDULER_ENABLED switch the polling worker and the schedule tick per process.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [
    { provide: JobsConfig, useFactory: () => loadJobsConfig() },
    JobHandlerRegistryImpl,
    { provide: JobHandlerRegistry, useExisting: JobHandlerRegistryImpl },
    JobRunnerService,
    JobQueueServiceImpl,
    { provide: JobQueueService, useExisting: JobQueueServiceImpl },
    JobWorkerService,
    JobSchedulerService,
  ],
  exports: [JobQueueService, JobHandlerRegistry, JobsConfig, JobSchedulerService],
})
export class JobsModule {}
