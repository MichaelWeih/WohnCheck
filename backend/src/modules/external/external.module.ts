import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExternalController } from "./external.controller";
import { ExternalService } from "./external.service";

/**
 * External experience platforms (Trustpilot, Google Maps, Reddit) — link-only (contract: external.types.ts),
 * plus user reports about a landlord profile. No platform content is fetched or stored.
 */
@Module({
  imports: [AuthModule],
  controllers: [ExternalController],
  providers: [ExternalService],
  exports: [ExternalService],
})
export class ExternalModule {}
