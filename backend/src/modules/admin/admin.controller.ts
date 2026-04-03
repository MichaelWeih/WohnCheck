import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("reviews/moderation-queue")
  getModerationQueue() {
    return this.adminService.getModerationQueue();
  }

  @Post("scores/:targetType/:targetId/recalculate")
  recalculateScore(
    @Param("targetType") targetType: string,
    @Param("targetId") targetId: string,
  ) {
    return this.adminService.triggerScoreRecalculation(targetType, targetId);
  }

  @Post("imports/run")
  runImport(@Body("sourceKey") sourceKey: string) {
    return this.adminService.createImportJob(sourceKey);
  }
}
