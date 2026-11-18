import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { LOCATION_RADII } from "../../../common/api/location-types";
import { LocationService } from "./location.service";

/** Requests per minute and client. */
export const ADDRESS_RATE_LIMIT = 30;
export const NEARBY_RATE_LIMIT = 10;

/** Number("") is 0, so an empty parameter must not be converted: it stays a string and fails @IsNumber. */
const toNumber = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === "string" && value.trim() !== "" ? Number(value) : value,
  );

class GeocodeQuery {
  @IsString() @MinLength(3) @MaxLength(160) q!: string;
}

class NearbyQuery {
  @toNumber() @IsNumber() @Min(-90) @Max(90) lat!: number;
  @toNumber() @IsNumber() @Min(-180) @Max(180) lon!: number;
  @toNumber() @IsIn([...LOCATION_RADII]) radius: number = 1000;
}

@Controller("data-sources")
@UseGuards(ThrottlerGuard)
export class LocationController {
  constructor(private readonly service: LocationService) {}

  /** Explicit resolution of a submitted address. Suggestions while typing: GET address-suggestions. */
  @Get("geocode")
  @Throttle({ default: { limit: ADDRESS_RATE_LIMIT, ttl: 60000 } })
  geocode(@Query() q: GeocodeQuery) {
    return this.service.geocode(q.q, false);
  }

  @Get("nearby-places")
  @Throttle({ default: { limit: NEARBY_RATE_LIMIT, ttl: 60000 } })
  nearby(@Query() q: NearbyQuery) {
    return this.service.nearby(q.lat, q.lon, q.radius);
  }
}
