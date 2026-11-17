import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";

/**
 * External platform providers, references, reports and /admin/external (contract: external.types.ts).
 * Skeleton: providers, controllers and exports are added by the module's implementation.
 */
@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class ExternalModule {}
