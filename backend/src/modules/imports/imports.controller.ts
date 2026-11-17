import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ImportListingsDto } from "./dto/import-listings.dto";
import { ImportsService } from "./imports.service";

@Controller("imports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post("listings")
  importListings(@Body() dto: ImportListingsDto) {
    return this.importsService.importListings(dto);
  }

  @Get("jobs")
  getJobs() {
    return this.importsService.getJobs();
  }
}
