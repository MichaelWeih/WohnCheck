import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { TargetType, UserRole } from "@prisma/client";
import { Request } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { QueryReviewsDto } from "./dto/query-reviews.dto";
import { ReportReviewDto } from "./dto/report-review.dto";
import { ReviewsService } from "./reviews.service";

type RequestWithUser = Request & {
  user?: { sub: string; role?: UserRole };
};

@Controller("reviews")
@UseGuards(ThrottlerGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** Public list: PUBLISHED only and without reports, unless the caller is an admin. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Req() req: RequestWithUser, @Query() query: QueryReviewsDto) {
    return this.reviewsService.findAll(query, req.user?.role === UserRole.ADMIN);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.LANDLORD, UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.LANDLORD, UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post(":id/report")
  report(@Req() req: RequestWithUser, @Param("id") id: string, @Body() dto: ReportReviewDto) {
    return this.reviewsService.report(id, req.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(":id/moderate")
  moderate(@Param("id") id: string, @Body() dto: ModerateReviewDto) {
    return this.reviewsService.moderate(id, dto);
  }

  @Get("aggregate/:targetType/:targetId")
  getAggregate(
    @Param("targetType") targetType: TargetType,
    @Param("targetId") targetId: string,
  ) {
    return this.reviewsService.getAggregates(targetType, targetId);
  }
}
