import { Controller, Get, Param, Query } from "@nestjs/common";
import { ListingQueryDto } from "./dto/listing-query.dto";
import { ListingsService } from "./listings.service";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  getListings(@Query() query: ListingQueryDto) {
    return this.listingsService.findAll(query);
  }

  @Get("map")
  getMapListings(@Query() query: ListingQueryDto) {
    return this.listingsService.findForMap(query);
  }

  @Get(":id")
  getListing(@Param("id") id: string) {
    return this.listingsService.findById(id);
  }

  @Get(":id/sources")
  getListingSources(@Param("id") id: string) {
    return this.listingsService.findSources(id);
  }
}
