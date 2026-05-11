import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DataSourcesController } from "./data-sources.controller";
import { DataSourcesService } from "./data-sources.service";
import { OsmProvider } from "./providers/osm.provider";
import { WikidataProvider } from "./providers/wikidata.provider";
import { ListingLinksProvider } from "./providers/listing-links.provider";
import { MarketPricesProvider } from "./providers/market-prices.provider";
import { PublicWebDirectoryProvider } from "./providers/public-web-directory.provider";

@Module({
  imports: [PrismaModule],
  controllers: [DataSourcesController],
  providers: [
    DataSourcesService,
    OsmProvider,
    WikidataProvider,
    ListingLinksProvider,
    MarketPricesProvider,
    PublicWebDirectoryProvider,
  ],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
