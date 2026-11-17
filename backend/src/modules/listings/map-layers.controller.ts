import { Controller, Get, Query } from "@nestjs/common";
import { ListingQueryDto } from "./dto/listing-query.dto";
import { ListingsService } from "./listings.service";

@Controller("map")
export class MapLayersController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get("layers")
  getLayers() {
    return this.listingsService.getMapLayers();
  }

  @Get("layers/listings")
  getListingLayer(@Query() query: ListingQueryDto) {
    return this.listingsService.findForMap(query);
  }

  @Get("layers/district-rent-prices")
  getDistrictRentPriceLayer(@Query() query: ListingQueryDto) {
    return this.listingsService.getDistrictRentPriceLayer(query);
  }
}
