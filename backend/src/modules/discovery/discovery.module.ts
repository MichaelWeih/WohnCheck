import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";

/**
 * Discovery providers, sync pipeline, search-on-miss and /admin/discovery (contract: discovery.types.ts).
 * Skeleton: providers, controllers and exports are added by the module's implementation.
 */
@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class DiscoveryModule {}
