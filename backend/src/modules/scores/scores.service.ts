import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TargetType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewsService } from "../reviews/reviews.service";

@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
  ) {}

  getLatestScore(targetType: string, targetId: string) {
    const resolvedTargetType = this.parseTargetType(targetType);

    return this.prisma.scoreResult.findFirst({
      where: {
        targetType: resolvedTargetType,
        targetId,
      },
      include: {
        components: true,
      },
      orderBy: {
        computedAt: "desc",
      },
    });
  }

  async recalculate(targetType: string, targetId: string) {
    const resolvedTargetType = this.parseTargetType(targetType);
    const reviewAggregate = await this.reviewsService.getAggregates(resolvedTargetType, targetId);

    const reviewScore = reviewAggregate.overallRating ?? 0;
    const confidenceScore = Math.min(100, reviewAggregate.reviewCount * 12);
    const normalizedReviewScore = reviewScore * 20;
    const totalScore = Number((normalizedReviewScore * 0.4 + confidenceScore * 0.1).toFixed(2));

    if (reviewAggregate.reviewCount === 0) {
      throw new NotFoundException("Noch keine veroeffentlichten Reviews fuer dieses Zielobjekt.");
    }

    return this.prisma.scoreResult.create({
      data: {
        targetType: resolvedTargetType,
        targetId,
        totalScore: new Prisma.Decimal(totalScore),
        confidenceScore: new Prisma.Decimal(confidenceScore),
        calculationVersion: "v1",
        components: {
          create: [
            {
              key: "review_score",
              label: "Nutzerbewertungen",
              value: new Prisma.Decimal(normalizedReviewScore),
              weight: new Prisma.Decimal(0.4),
              source: "reviews",
              metadata: reviewAggregate.categoryRatings,
            },
            {
              key: "confidence_score",
              label: "Datenvertrauen",
              value: new Prisma.Decimal(confidenceScore),
              weight: new Prisma.Decimal(0.1),
              source: "system",
            },
          ],
        },
      },
      include: {
        components: true,
      },
    });
  }

  private parseTargetType(targetType: string): TargetType {
    const normalized = targetType.trim().toUpperCase();

    switch (normalized) {
      case TargetType.LANDLORD:
        return TargetType.LANDLORD;
      case TargetType.PROPERTY:
        return TargetType.PROPERTY;
      case TargetType.NEIGHBORHOOD:
        return TargetType.NEIGHBORHOOD;
      default:
        throw new NotFoundException("Unbekannter TargetType.");
    }
  }
}
