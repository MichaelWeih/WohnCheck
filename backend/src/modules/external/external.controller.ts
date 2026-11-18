import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { MappingReportKind, ReporterRole } from "@prisma/client";
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Request } from "express";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { AuthUser } from "../auth/interfaces/auth-user.interface";
import { ExternalService } from "./external.service";

const PROFILE_REPORT_KINDS = [
  MappingReportKind.WRONG_EXTERNAL_LINK,
  MappingReportKind.WRONG_COMPANY_DATA,
  MappingReportKind.DUPLICATE,
  MappingReportKind.WRONG_RELATION,
  MappingReportKind.REMOVAL_REQUEST,
  MappingReportKind.REVIEW_COMPLAINT,
  MappingReportKind.OTHER,
];

class CreateMappingReportDto {
  @IsIn(PROFILE_REPORT_KINDS) kind!: MappingReportKind;
  @IsOptional() @IsEnum(ReporterRole) reporterRole?: ReporterRole;
  @IsString() @MinLength(10) @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(40) externalReferenceId?: string;
  @IsOptional() @IsString() @MaxLength(40) reviewId?: string;
  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;
}

@Controller("landlords")
@UseGuards(ThrottlerGuard)
export class ExternalController {
  constructor(private readonly service: ExternalService) {}

  /** Links to external platforms only — never their ratings or texts. */
  @Get(":id/external")
  external(@Param("id") id: string) {
    return this.service.externalFor(id);
  }

  @Post(":id/reports")
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  report(@Param("id") id: string, @Body() body: CreateMappingReportDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.createReport(id, body, req.user?.sub ?? null);
  }
}
