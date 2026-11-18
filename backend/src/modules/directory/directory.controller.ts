import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { CompanyKind, MappingReportStatus, PropertyRole, ReporterRole, UserRole } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Request } from "express";
import { LandlordSort } from "../../common/api/api-types";
import { GERMAN_STATE_CODES } from "../../common/geo/german-states";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthUser } from "../auth/interfaces/auth-user.interface";
import { DirectoryService } from "./directory.service";
import { PropertyReportsService } from "./property-reports.service";

type AuthRequest = Request & { user?: AuthUser };

class LandlordListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsEnum(CompanyKind) kind?: CompanyKind;
  @IsOptional() @IsIn(GERMAN_STATE_CODES) state?: string;
  @IsOptional() @IsIn(["name", "reviews", "rating", "recent"]) sort?: LandlordSort;
}

class SearchQuery {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(CompanyKind) kind?: CompanyKind;
  @IsOptional() @IsIn(GERMAN_STATE_CODES) state?: string;
}

class LookupQuery {
  @IsString() @MinLength(2) @MaxLength(120) street!: string;
  @IsOptional() @IsString() @MaxLength(20) houseNumber?: string;
  @IsOptional() @Matches(/^\d{5}$/) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
}

class CreatePropertyReportDto {
  @IsString() @MinLength(2) @MaxLength(120) street!: string;
  @IsString() @MinLength(1) @MaxLength(20) houseNumber!: string;
  @Matches(/^\d{5}$/) postalCode!: string;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsEnum(PropertyRole) role!: PropertyRole;
  @IsOptional() @IsString() @MaxLength(200) landlordId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) organizationName?: string;
  @IsOptional() @IsBoolean() privateLandlord?: boolean;
  @IsOptional() @IsString() @MaxLength(500) evidenceUrl?: string;
  @IsOptional() @IsEnum(ReporterRole) reporterRole?: ReporterRole;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

class ApproveReportDto {
  @IsString() @MaxLength(200) landlordId!: string;
  @IsOptional() @IsEnum(PropertyRole) role?: PropertyRole;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsString() @MaxLength(40) unitLabel?: string;
  @IsOptional() @IsBoolean() replacesCurrent?: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class DismissReportDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class EndRelationDto {
  @IsOptional() @IsDateString() validTo?: string;
}

class CandidateDecisionDto {
  @IsIn(["ACTIVE", "REJECTED"]) status!: "ACTIVE" | "REJECTED";
  @IsOptional() @IsEnum(CompanyKind) kind?: CompanyKind;
}

class ReportListQuery {
  @IsOptional() @IsEnum(MappingReportStatus) status?: MappingReportStatus;
}

@Controller()
@UseGuards(ThrottlerGuard)
export class DirectoryController {
  constructor(
    private readonly directoryService: DirectoryService,
    private readonly reports: PropertyReportsService,
  ) {}

  @Get("landlords")
  getLandlords(@Query() query: LandlordListQuery) {
    return this.directoryService.getLandlords(query);
  }

  @Get("landlords/:id")
  getLandlord(@Param("id") id: string) {
    return this.directoryService.getLandlordById(id);
  }

  @Get("landlords/:id/profile")
  getLandlordProfile(@Param("id") id: string) {
    return this.directoryService.getLandlordProfile(id);
  }

  @Get("landlords/:id/listings")
  getLandlordListings(@Param("id") id: string) {
    return this.directoryService.getLandlordListings(id);
  }

  @Get("properties")
  getProperties() {
    return this.directoryService.getProperties();
  }

  /** Must be declared before properties/:id. */
  @Get("properties/lookup")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  lookup(@Query() query: LookupQuery) {
    return this.directoryService.lookupAddress(query);
  }

  @Post("properties/reports")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  report(@Req() req: AuthRequest, @Body() body: CreatePropertyReportDto) {
    return this.reports.create(req.user!.sub, body);
  }

  @Get("properties/:id")
  getProperty(@Param("id") id: string) {
    return this.directoryService.getPropertyById(id);
  }

  @Get("neighborhoods")
  getNeighborhoods() {
    return this.directoryService.getNeighborhoods();
  }

  @Get("neighborhoods/:id")
  getNeighborhood(@Param("id") id: string) {
    return this.directoryService.getNeighborhoodById(id);
  }

  @Get("search")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  search(@Query() query: SearchQuery) {
    return this.directoryService.search(query.q ?? "", { kind: query.kind, state: query.state });
  }

  @Get("search/suggest")
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  suggest(@Query() query: SearchQuery) {
    return this.directoryService.suggest(query.q ?? "");
  }

  @Get("directory/stats")
  stats() {
    return this.directoryService.stats();
  }
}

/** Review queue for address reports and imported candidates (role ADMIN). */
@Controller("admin/directory")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDirectoryController {
  constructor(private readonly reports: PropertyReportsService) {}

  @Get("property-reports")
  listReports(@Query() query: ReportListQuery) {
    return this.reports.list(query.status);
  }

  @Post("property-reports/:id/approve")
  approve(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: ApproveReportDto) {
    return this.reports.approve(id, req.user!.sub, body);
  }

  @Post("property-reports/:id/dismiss")
  dismiss(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: DismissReportDto) {
    return this.reports.dismiss(id, req.user!.sub, body.note);
  }

  @Post("property-parties/:id/end")
  endRelation(@Param("id") id: string, @Body() body: EndRelationDto) {
    return this.reports.endRelation(id, body.validTo);
  }

  @Get("candidates")
  candidates() {
    return this.reports.listCandidates();
  }

  @Patch("landlords/:id")
  decide(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: CandidateDecisionDto) {
    return this.reports.decideCandidate(id, body.status, req.user!.sub, body.kind);
  }
}
