import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";

/**
 * Postgres-backed job queue, worker, scheduler and /admin/jobs (contract: job.types.ts).
 * Global: every module can inject JobQueueService and JobHandlerRegistry.
 * Skeleton: providers, controllers and exports are added by the module's implementation.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class JobsModule {}
