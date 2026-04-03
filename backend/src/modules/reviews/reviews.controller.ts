import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { TargetType, UserRole } from "@prisma/client";
import { Request } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { QueryReviewsDto } from "./dto/query-reviews.dto";
import { ReportReviewDto } from "./dto/report-review.dto";
import { ReviewsService } from "./reviews.service";

type RequestWithUser = Request & {
  user?: { sub: string };
};

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findAll(@Query() query: QueryReviewsDto) {
    return this.reviewsService.findAll(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.LANDLORD, UserRole.ADMIN)
  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.LANDLORD, UserRole.ADMIN)
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
