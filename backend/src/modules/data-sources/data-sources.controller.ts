import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { LocationService } from "./location/location.service";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { DataSourceQueryDto } from "./dto/data-source-query.dto";
import { DataSourcesService } from "./data-sources.service";

@Controller("data-sources")
export class DataSourcesController {
  constructor(
    private readonly dataSourcesService: DataSourcesService,
    private readonly location: LocationService,
  ) {}

  @Get("strategy")
  getStrategy() {
    return this.dataSourcesService.getRetrievalStrategy();
  }

  @Get("sources")
  getSources() {
    return this.dataSourcesService.getSourceCatalog();
  }

  @Get("landlord-candidates")
  getLandlordCandidates(@Query() query: DataSourceQueryDto) {
    return this.dataSourcesService.getLandlordCandidates(
      query.city,
      query.refresh === "true",
    );
  }

  @Get("public-landlord-directory")
  getPublicLandlordDirectory(@Query() query: DataSourceQueryDto) {
    return this.dataSourcesService.getPublicLandlordDirectory(
      query.city,
      query.refresh === "true",
    );
  }

  @Get("area-signals")
  getAreaSignals(@Query() query: DataSourceQueryDto) {
    return this.dataSourcesService.getAreaSignals(
      query.city,
      query.refresh === "true",
    );
  }

  @Get("address-suggestions")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getAddressSuggestions(@Query() query: DataSourceQueryDto) {
    return this.location.geocode(query.q ?? "", true);
  }

  @Get("address-score-context")
  getAddressScoreContext(@Query() query: DataSourceQueryDto) {
    return this.dataSourcesService.getAddressScoreContext(
      Number(query.lat),
      Number(query.lon),
      query.label,
      query.radius ? Number(query.radius) : undefined,
      query.refresh === "true",
    );
  }

  @Get("listing-links")
  getListingLinks(@Query() query: DataSourceQueryDto) {
    return this.dataSourcesService.getListingLinks({
      street: query.street,
      houseNumber: query.houseNumber,
      postalCode: query.postalCode,
      city: query.city,
    });
  }

  @Get("market-prices")
  getMarketPrices(@Query() query: DataSourceQueryDto) {
    return this.dataSourcesService.getMarketPrices(
      query.city,
      query.district,
      query.postalCode,
    );
  }
}
