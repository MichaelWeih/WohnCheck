import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminDiscoveryController, DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";
import { GleifLandlordProvider } from "./providers/gleif-landlord.provider";
import { WikidataLandlordProvider } from "./providers/wikidata-landlord.provider";

/**
 * Discovery providers (Wikidata, GLEIF), sync pipeline, search-on-miss and /admin/discovery
 * (contract: discovery.types.ts). Nothing is fetched automatically: an admin starts the first import
 * (POST /admin/discovery/sources/:key/sync or `npm run discovery:sync`); weekly schedules exist but are
 * disabled unless DISCOVERY_AUTO_SYNC=true.
 */
@Module({
  imports: [AuthModule],
  controllers: [DiscoveryController, AdminDiscoveryController],
  providers: [DiscoveryService, WikidataLandlordProvider, GleifLandlordProvider],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
