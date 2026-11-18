import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { DiscoveryService } from "./discovery.service";

class CreateDiscoveryRequestDto {
  @IsString() @MinLength(3) @MaxLength(80) query!: string;
}

class SyncRequestDto {
  @IsOptional() @IsString() @MaxLength(80) scope?: string;
  @IsOptional() @IsIn(["FULL"]) mode?: "FULL";
}

/** Search-on-miss for visitors: started only by an explicit click, throttled per client and globally. */
@Controller("discovery")
@UseGuards(ThrottlerGuard)
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Post("requests")
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  create(@Body() body: CreateDiscoveryRequestDto) {
    return this.discovery.createRequest(body.query);
  }

  @Get("requests/:id")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  get(@Param("id") id: string) {
    return this.discovery.getRequest(id);
  }
}

@Controller("admin/discovery")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get("sources")
  sources() {
    return this.discovery.sourceStates();
  }

  /** Starts (or resumes) the import of a source; without `scope` every scope of the source. */
  @Post("sources/:key/sync")
  sync(@Param("key") key: string, @Body() body: SyncRequestDto) {
    return this.discovery.requestSync(key, body.scope, body.mode);
  }
}
