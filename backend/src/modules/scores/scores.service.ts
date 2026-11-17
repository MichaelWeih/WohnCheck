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
    const [reviewAggregate, snapshots] = await Promise.all([
      this.reviewsService.getAggregates(resolvedTargetType, targetId),
      this.prisma.publicSourceSnapshot.findMany({
        where: {
          targetType: resolvedTargetType,
          targetId,
        },
        orderBy: {
          capturedAt: "desc",
        },
      }),
    ]);

    const publicComponents = this.getPublicSourceComponents(snapshots);
    const reviewScore = reviewAggregate.overallRating ?? 0;
    const normalizedReviewScore = reviewScore * 20;
    const confidenceScore = Math.min(100, reviewAggregate.reviewCount * 12 + publicComponents.length * 10);
    const weightedPublicScore = publicComponents.reduce(
      (sum, component) => sum + component.value * component.weight,
      0,
    );
    const reviewWeight = reviewAggregate.reviewCount > 0 ? 0.25 : 0;
    const totalWeight = publicComponents.reduce((sum, component) => sum + component.weight, 0) + reviewWeight;

    if (totalWeight === 0) {
      throw new NotFoundException("Noch keine Reviews oder öffentlichen Quellen für dieses Zielobjekt.");
    }

    const totalScore = Number(
      ((weightedPublicScore + normalizedReviewScore * reviewWeight) / totalWeight).toFixed(2),
    );

    return this.prisma.scoreResult.create({
      data: {
        targetType: resolvedTargetType,
        targetId,
        totalScore: new Prisma.Decimal(totalScore),
        confidenceScore: new Prisma.Decimal(confidenceScore),
        calculationVersion: "v1",
        components: {
          create: [
            ...(reviewAggregate.reviewCount > 0
              ? [{
              key: "review_score",
              label: "Nutzerbewertungen",
              value: new Prisma.Decimal(normalizedReviewScore),
              weight: new Prisma.Decimal(reviewWeight),
              source: "reviews",
              metadata: reviewAggregate.categoryRatings,
            }]
              : []),
            ...publicComponents.map((component) => ({
              key: component.key,
              label: component.label,
              value: new Prisma.Decimal(component.value),
              weight: new Prisma.Decimal(component.weight),
              source: component.source,
              metadata: component.metadata,
            })),
            {
              key: "confidence_score",
              label: "Datenvertrauen",
              value: new Prisma.Decimal(confidenceScore),
              weight: new Prisma.Decimal(0),
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

  private getPublicSourceComponents(snapshots: Array<{ sourceKey: string; payload: Prisma.JsonValue }>) {
    const components = new Map<string, {
      key: string;
      label: string;
      value: number;
      weight: number;
      source: string;
      metadata: Prisma.InputJsonValue;
    }>();

    for (const snapshot of snapshots) {
      if (typeof snapshot.payload !== "object" || snapshot.payload === null || Array.isArray(snapshot.payload)) {
        continue;
      }

      const payload = snapshot.payload as Record<string, unknown>;
      const signals = payload.signals;

      if (typeof signals !== "object" || signals === null || Array.isArray(signals)) {
        continue;
      }

      for (const [key, rawSignal] of Object.entries(signals)) {
        if (typeof rawSignal !== "object" || rawSignal === null || Array.isArray(rawSignal)) {
          continue;
        }

        const signal = rawSignal as Record<string, unknown>;
        const value = typeof signal.score === "number" ? signal.score : undefined;
        const weight = typeof signal.weight === "number" ? signal.weight : undefined;
        const label = typeof signal.label === "string" ? signal.label : key;

        if (value === undefined || weight === undefined) {
          continue;
        }

        if (components.has(key)) {
          continue;
        }

        components.set(key, {
          key,
          label,
          value,
          weight,
          source: snapshot.sourceKey,
          metadata: {
            details: signal.details ?? null,
            sourceName: payload.sourceName ?? snapshot.sourceKey,
            sourceUrl: payload.sourceUrl ?? null,
            capturedLabel: payload.capturedLabel ?? null,
          },
        });
      }
    }

    return Array.from(components.values());
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
