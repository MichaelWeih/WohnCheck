import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReviewStatus, TargetType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { QueryReviewsDto } from "./dto/query-reviews.dto";
import { ReportReviewDto } from "./dto/report-review.dto";

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryReviewsDto) {
    const where: Prisma.ReviewWhereInput = {
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.status ? { status: query.status as ReviewStatus } : {}),
    };

    return this.prisma.review.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
          },
        },
        reports: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(userId: string, dto: CreateReviewDto) {
    await this.ensureTargetExists(dto.targetType, dto.targetId);

    return this.prisma.review.create({
      data: {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        title: dto.title,
        text: dto.text,
        overallRating: new Prisma.Decimal(dto.overallRating),
        categoryRatings: dto.categoryRatings,
        verificationLevel: dto.verificationLevel,
        status: ReviewStatus.PENDING,
      },
    });
  }

  async report(reviewId: string, userId: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });

    if (!review) {
      throw new NotFoundException("Review nicht gefunden.");
    }

    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: review.status === ReviewStatus.PUBLISHED ? ReviewStatus.REPORTED : review.status,
      },
    });

    return this.prisma.reviewReport.create({
      data: {
        reviewId,
        userId,
        reason: dto.reason,
      },
    });
  }

  async moderate(reviewId: string, dto: ModerateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true },
    });

    if (!review) {
      throw new NotFoundException("Review nicht gefunden.");
    }

    const status = dto.action === "publish" ? ReviewStatus.PUBLISHED : ReviewStatus.REJECTED;

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status,
        moderationReason: dto.reason,
        moderatedAt: new Date(),
      },
    });
  }

  async getAggregates(targetType: TargetType, targetId: string) {
    const publishedReviews = await this.prisma.review.findMany({
      where: {
        targetType,
        targetId,
        status: ReviewStatus.PUBLISHED,
        OR: [
          { verificationLevel: null },
          { verificationLevel: { not: "public-source-summary" } },
        ],
      },
      select: {
        overallRating: true,
        categoryRatings: true,
      },
    });

    if (publishedReviews.length === 0) {
      return {
        reviewCount: 0,
        overallRating: null,
        categoryRatings: {},
      };
    }

    const overallSum = publishedReviews.reduce(
      (sum, review) => sum + Number(review.overallRating),
      0,
    );

    const categoryTotals = new Map<string, { sum: number; count: number }>();

    for (const review of publishedReviews) {
      const ratings = review.categoryRatings as Record<string, number>;

      for (const [key, value] of Object.entries(ratings)) {
        const current = categoryTotals.get(key) ?? { sum: 0, count: 0 };
        current.sum += Number(value);
        current.count += 1;
        categoryTotals.set(key, current);
      }
    }

    const categoryRatings = Object.fromEntries(
      Array.from(categoryTotals.entries()).map(([key, value]) => [
        key,
        Number((value.sum / value.count).toFixed(2)),
      ]),
    );

    return {
      reviewCount: publishedReviews.length,
      overallRating: Number((overallSum / publishedReviews.length).toFixed(2)),
      categoryRatings,
    };
  }

  private async ensureTargetExists(targetType: TargetType, targetId: string) {
    let exists = false;

    switch (targetType) {
      case TargetType.LANDLORD:
        exists = Boolean(await this.prisma.landlord.findUnique({ where: { id: targetId }, select: { id: true } }));
        break;
      case TargetType.PROPERTY:
        exists = Boolean(await this.prisma.property.findUnique({ where: { id: targetId }, select: { id: true } }));
        break;
      case TargetType.NEIGHBORHOOD:
        exists = Boolean(await this.prisma.neighborhood.findUnique({ where: { id: targetId }, select: { id: true } }));
        break;
      default:
        throw new BadRequestException("Ungültiger Bewertungstyp.");
    }

    if (!exists) {
      throw new BadRequestException("Zielobjekt für die Bewertung wurde nicht gefunden.");
    }
  }
}
