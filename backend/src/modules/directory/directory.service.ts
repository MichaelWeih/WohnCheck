import { Injectable, NotFoundException } from "@nestjs/common";
import { ReviewStatus, TargetType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type RatingSummary = {
  ratingOverall: number | null;
  reviewCount: number;
};

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getLandlords() {
    const landlords = await this.prisma.landlord.findMany({
      orderBy: { name: "asc" },
    });

    return this.withRatingSummaries(TargetType.LANDLORD, landlords);
  }

  async getLandlordById(id: string) {
    const landlord = await this.prisma.landlord.findUnique({
      where: { id },
      include: {
        properties: true,
      },
    });

    if (!landlord) {
      throw new NotFoundException("Vermieter nicht gefunden.");
    }

    return landlord;
  }

  async getProperties() {
    const properties = await this.prisma.property.findMany({
      include: {
        landlord: true,
        neighborhood: true,
      },
      orderBy: [{ city: "asc" }, { street: "asc" }],
    });

    return this.withRatingSummaries(TargetType.PROPERTY, properties);
  }

  async getPropertyById(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        landlord: true,
        neighborhood: true,
      },
    });

    if (!property) {
      throw new NotFoundException("Gebaeude nicht gefunden.");
    }

    return property;
  }

  async getNeighborhoods() {
    const neighborhoods = await this.prisma.neighborhood.findMany({
      include: {
        properties: true,
      },
      orderBy: [{ city: "asc" }, { districtName: "asc" }],
    });

    return this.withRatingSummaries(TargetType.NEIGHBORHOOD, neighborhoods);
  }

  async getNeighborhoodById(id: string) {
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id },
      include: {
        properties: true,
      },
    });

    if (!neighborhood) {
      throw new NotFoundException("Nachbarschaft nicht gefunden.");
    }

    return neighborhood;
  }

  async search(query: string) {
    const q = query.trim();

    const [landlords, properties, neighborhoods] = await Promise.all([
      this.prisma.landlord.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
      }),
      this.prisma.property.findMany({
        where: {
          OR: [
            { street: { contains: q, mode: "insensitive" } },
            { postalCode: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        include: {
          landlord: true,
        },
        take: 10,
      }),
      this.prisma.neighborhood.findMany({
        where: {
          OR: [
            { districtName: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { postalCode: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
      }),
    ]);

    const [landlordsWithRatings, propertiesWithRatings, neighborhoodsWithRatings] = await Promise.all([
      this.withRatingSummaries(TargetType.LANDLORD, landlords),
      this.withRatingSummaries(TargetType.PROPERTY, properties),
      this.withRatingSummaries(TargetType.NEIGHBORHOOD, neighborhoods),
    ]);

    return {
      landlords: landlordsWithRatings,
      properties: propertiesWithRatings,
      neighborhoods: neighborhoodsWithRatings,
    };
  }

  /**
   * Attaches average rating and count of published reviews to each entity,
   * using a single grouped query per target type.
   */
  private async withRatingSummaries<T extends { id: string }>(
    targetType: TargetType,
    entities: T[],
  ): Promise<Array<T & RatingSummary>> {
    if (entities.length === 0) {
      return [];
    }

    const groups = await this.prisma.review.groupBy({
      by: ["targetId"],
      where: {
        targetType,
        targetId: { in: entities.map((entity) => entity.id) },
        status: ReviewStatus.PUBLISHED,
      },
      _avg: { overallRating: true },
      _count: { _all: true },
    });

    const summaries = new Map<string, RatingSummary>(
      groups.map((group) => [
        group.targetId,
        {
          ratingOverall:
            group._avg.overallRating === null ? null : Number(Number(group._avg.overallRating).toFixed(2)),
          reviewCount: group._count._all,
        },
      ]),
    );

    return entities.map((entity) => ({
      ...entity,
      ...(summaries.get(entity.id) ?? { ratingOverall: null, reviewCount: 0 }),
    }));
  }
}
