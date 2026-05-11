import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DuplicateDetectionService } from "./pipeline/duplicate-detection.service";
import { DistrictsController } from "./districts.controller";
import { LandlordResolver } from "./pipeline/landlord-resolver.service";
import { ListingNormalizer } from "./pipeline/listing-normalizer.service";
import { ListingValidator } from "./pipeline/listing-validator.service";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";
import { MapLayersController } from "./map-layers.controller";

@Module({
  imports: [PrismaModule],
  controllers: [ListingsController, MapLayersController, DistrictsController],
  providers: [
    ListingsService,
    ListingNormalizer,
    ListingValidator,
    LandlordResolver,
    DuplicateDetectionService,
  ],
  exports: [
    ListingsService,
    ListingNormalizer,
    ListingValidator,
    LandlordResolver,
    DuplicateDetectionService,
  ],
})
export class ListingsModule {}
