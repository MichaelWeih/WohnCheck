import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReviewStatus, TargetType } from "@prisma/client";
import { PublicLandlordLookupService } from "../companies/company.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { QueryReviewsDto } from "./dto/query-reviews.dto";
import { ReportReviewDto } from "./dto/report-review.dto";

/**
 * Rating categories per target type. New reviews may only use these keys (1..5 each, all optional).
 * Older reviews keep their stored keys; aggregates show whatever was rated.
 */
export const REVIEW_CATEGORIES: Record<TargetType, readonly string[]> = {
  LANDLORD: [
    "Erreichbarkeit",
    "Kommunikation",
    "Reparaturen und Instandhaltung",
    "Zuverlässigkeit",
    "Nebenkosten-Transparenz",
    "Umgang mit Beschwerden",
    "Fairness",
  ],
  PROPERTY: ["Sauberkeit", "Lärm", "Zustand", "Sicherheit", "Gemeinschaft", "Müllsituation"],
  NEIGHBORHOOD: ["Sicherheit", "Ruhe", "Einkaufsmöglichkeiten", "ÖPNV", "Familienfreundlichkeit", "Grünflächen"],
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly landlords: PublicLandlordLookupService,
  ) {}

  /**
   * Public: only PUBLISHED reviews, without report data. Admins may filter by status and see reports.
   * A merged landlord id resolves to the surviving record.
   */
  async findAll(query: QueryReviewsDto, isAdmin = false) {
    let targetId = query.targetId;
    if (targetId && query.targetType === TargetType.LANDLORD) {
      const resolved = await this.landlords.tryResolve(targetId);
      if (resolved) targetId = resolved.landlord.id;
      else if (!isAdmin) return [];
    }
    const where: Prisma.ReviewWhereInput = {
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(isAdmin
        ? query.status
          ? { status: query.status as ReviewStatus }
          : {}
        : { status: ReviewStatus.PUBLISHED }),
    };

    return this.prisma.review.findMany({
      where,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        title: true,
        text: true,
        overallRating: true,
        categoryRatings: true,
        status: true,
        helpfulCount: true,
        verificationLevel: true,
        tenancyVerification: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, displayName: true, isVerified: true } },
        ...(isAdmin ? { reports: true, moderationReason: true, moderatedAt: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      ...(query.limit ? { take: query.limit } : {}),
    });
  }

  async create(userId: string, dto: CreateReviewDto) {
    const targetId = await this.ensureTargetExists(dto.targetType, dto.targetId);
    const categoryRatings = this.validCategories(dto.targetType, dto.categoryRatings);
    // One review per user and target (also enforced by a partial unique index; rejected ones do not count).
    const existing = await this.prisma.review.findFirst({
      where: { userId, targetType: dto.targetType, targetId, status: { not: ReviewStatus.REJECTED } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Du hast dieses Profil bereits bewertet.");

    try {
      return await this.prisma.review.create({
        data: {
          userId,
          targetType: dto.targetType,
          targetId,
          title: dto.title.trim(),
          text: dto.text.trim(),
          overallRating: new Prisma.Decimal(dto.overallRating),
          categoryRatings,
          // Users never set a verification level or tenancy proof themselves.
          status: ReviewStatus.PENDING,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Du hast dieses Profil bereits bewertet.");
      throw error;
    }
  }

  private validCategories(targetType: TargetType, ratings: Record<string, number>): Record<string, number> {
    const allowed = REVIEW_CATEGORIES[targetType];
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(ratings ?? {})) {
      if (!allowed.includes(key)) throw new BadRequestException(`Unbekannte Bewertungskategorie: ${key}`);
      const number = Number(value);
      if (!Number.isFinite(number) || number < 1 || number > 5) throw new BadRequestException("Kategorien werden mit 1 bis 5 Sternen bewertet.");
      result[key] = Math.round(number * 2) / 2;
    }
    return result;
  }

  async report(reviewId: string, userId: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true, userId: true },
    });

    if (!review || review.status === ReviewStatus.REJECTED) {
      throw new NotFoundException("Review nicht gefunden.");
    }
    if (review.userId === userId) throw new BadRequestException("Eigene Bewertungen können nicht gemeldet werden.");
    const already = await this.prisma.reviewReport.findFirst({ where: { reviewId, userId }, select: { id: true } });
    if (already) throw new ConflictException("Du hast diese Bewertung bereits gemeldet.");

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

  /** Returns the id to store: for landlords the ACTIVE (surviving) record; candidates cannot be reviewed. */
  private async ensureTargetExists(targetType: TargetType, targetId: string): Promise<string> {
    let exists = false;

    switch (targetType) {
      case TargetType.LANDLORD: {
        const resolved = await this.landlords.tryResolve(targetId);
        if (!resolved) throw new BadRequestException("Dieser Vermieter ist nicht im öffentlichen Verzeichnis.");
        return resolved.landlord.id;
      }
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
    return targetId;
  }
}
