import { Injectable } from "@nestjs/common";
import { ListingStatus, ReviewStatus, TargetType } from "@prisma/client";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSourcesService: DataSourcesService,
  ) {}

  async getLandlords() {
    const landlords = await this.prisma.landlord.findMany({
      orderBy: { name: "asc" },
    });

    return this.withReviewStats(TargetType.LANDLORD, landlords);
  }

  async getLandlordById(id: string, city?: string) {
    const landlord = await this.prisma.landlord.findUnique({
      where: { id },
      include: {
        profile: true,
        listings: {
          include: {
            district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
            sourceProvider: { include: { qualityScore: true } },
          },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
          take: 12,
        },
        properties: {
          include: {
            landlord: true,
            neighborhood: true,
          },
          orderBy: [{ city: "asc" }, { street: "asc" }, { houseNumber: "asc" }],
        },
      },
    });

    if (!landlord) {
      return this.getExternalLandlordProfile(id, city);
    }

    const { properties, listings, profile, ...landlordData } = landlord;
    const [[withStats], propertiesWithStats, latestPropertyScores] = await Promise.all([
      this.withReviewStats(TargetType.LANDLORD, [landlordData]),
      this.withReviewStats(TargetType.PROPERTY, properties),
      this.getLatestScores(TargetType.PROPERTY, properties.map((property) => property.id)),
    ]);

    return {
      ...withStats,
      profile: profile ?? this.buildLandlordProfileFromListings(listings),
      listings: listings.map((listing) => this.toLandlordListingCard(listing)),
      properties: propertiesWithStats.map((property) => ({
        ...property,
        latestScore: latestPropertyScores.get(property.id) ?? null,
      })),
    };
  }

  async getProperties() {
    const properties = await this.prisma.property.findMany({
      include: {
        landlord: true,
        neighborhood: true,
      },
      orderBy: [{ city: "asc" }, { street: "asc" }],
    });

    return this.withReviewStats(TargetType.PROPERTY, properties);
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
      return null;
    }

    const [withStats] = await this.withReviewStats(TargetType.PROPERTY, [property]);
    return withStats;
  }

  async getNeighborhoods() {
    const neighborhoods = await this.prisma.neighborhood.findMany({
      include: {
        properties: true,
      },
      orderBy: [{ city: "asc" }, { districtName: "asc" }],
    });

    return this.withReviewStats(TargetType.NEIGHBORHOOD, neighborhoods);
  }

  async getNeighborhoodById(id: string) {
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id },
      include: {
        properties: true,
      },
    });

    if (!neighborhood) {
      return null;
    }

    const [withStats] = await this.withReviewStats(TargetType.NEIGHBORHOOD, [neighborhood]);
    return withStats;
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

    const [landlordsWithStats, propertiesWithStats, neighborhoodsWithStats, externalLandlords] = await Promise.all([
      this.withReviewStats(TargetType.LANDLORD, landlords),
      this.withReviewStats(TargetType.PROPERTY, properties),
      this.withReviewStats(TargetType.NEIGHBORHOOD, neighborhoods),
      this.getExternalLandlordMatches(q, landlords.length + properties.length + neighborhoods.length),
    ]);

    return {
      landlords: landlordsWithStats,
      properties: propertiesWithStats,
      neighborhoods: neighborhoodsWithStats,
      externalLandlords,
    };
  }

  async getLandlordListings(id: string) {
    const landlord = await this.prisma.landlord.findUnique({ where: { id } });

    if (!landlord) {
      return { landlordId: id, total: 0, items: [] };
    }

    const listings = await this.prisma.listing.findMany({
      where: {
        landlordId: id,
        status: ListingStatus.AVAILABLE,
      },
      include: {
        district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
        sourceProvider: { include: { qualityScore: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
    });

    return {
      landlordId: id,
      total: listings.length,
      items: listings.map((listing) => this.toLandlordListingCard(listing)),
    };
  }

  private async getExternalLandlordMatches(query: string, internalResultCount: number) {
    if (internalResultCount > 0 || query.length < 3) {
      return [];
    }

    try {
      const directory = await this.dataSourcesService.getPublicLandlordDirectory(query, false);

      return directory.results.slice(0, 6).map((candidate) => ({
        id: candidate.externalId,
        name: candidate.name,
        companyType: "Öffentlicher Vermieter-Kandidat",
        city: candidate.city,
        website: candidate.externalUrl,
        sourceName: candidate.evidence?.sourceName ?? directory.source.attribution,
        sourceUrl: candidate.evidence?.sourceUrl ?? candidate.externalUrl,
        confidence: candidate.confidence,
        reviewCount: 0,
        ratingOverall: null,
        ratings: {},
      }));
    } catch {
      return [];
    }
  }

  private async getExternalLandlordProfile(id: string, city?: string) {
    if (!city) {
      return null;
    }

    try {
      const directory = await this.dataSourcesService.getPublicLandlordDirectory(city, false);
      const candidate = directory.results.find((entry) => entry.externalId === id);

      if (!candidate) {
        return null;
      }

      const scoreFactors = [
        {
          key: "data_transparency",
          label: "Daten-Transparenz",
          value: Math.round(candidate.confidence * 100),
          weight: 0.35,
          impact: "positive",
          explanation: "Der Vermieter wurde in einer öffentlichen Quelle mit nachvollziehbarer Herkunft gefunden.",
        },
        {
          key: "wohncheck_reviews",
          label: "WohnCheck-Erfahrungsberichte",
          value: null,
          weight: 0.3,
          impact: "neutral",
          explanation: "Noch keine eigenen WohnCheck-Bewertungen vorhanden. Das senkt nur die Datenqualität, nicht den Score.",
        },
        {
          key: "known_inventory",
          label: "Bekannter Wohnungsbestand",
          value: null,
          weight: 0.2,
          impact: "neutral",
          explanation: "Noch keine Wohnungen dieses Vermieters im WohnCheck-Verzeichnis hinterlegt.",
        },
        {
          key: "price_position",
          label: "Mietpreisniveau",
          value: null,
          weight: 0.15,
          impact: "neutral",
          explanation: "Preisvergleich wird berechnet, sobald verfügbare Wohnungen mit Quadratmeterpreis vorliegen.",
        },
      ];

      return {
        id: candidate.externalId,
        name: candidate.name,
        companyType: "Öffentlicher Vermieter-Kandidat",
        city: candidate.city,
        website: candidate.externalUrl,
        slug: candidate.externalId,
        createdAt: directory.generatedAt,
        updatedAt: directory.source.fetchedAt,
        reviewCount: 0,
        ratingOverall: null,
        ratings: {},
        properties: [],
        profile: {
          isExternalCandidate: true,
          knownListingsCount: 0,
          activeListingsCount: 0,
          averagePricePerSqm: null,
          activeDistricts: [],
          lastUpdatedAt: directory.source.fetchedAt,
          dataQuality: Math.round(candidate.confidence * 100),
          summary: "Dieser Vermieter wurde aus öffentlichen Quellen erkannt und ist noch kein vollständig verifiziertes WohnCheck-Profil.",
        },
        score: {
          totalScore: Math.round(candidate.confidence * 72),
          confidenceScore: Math.round(candidate.confidence * 58),
          label: "Vorläufiger Vermieter-Score",
          note: "Fehlende WohnCheck-Daten werden nicht negativ bewertet, sondern reduzieren die Konfidenz.",
          factors: scoreFactors,
        },
        publicSources: [
          {
            sourceKey: candidate.sourceKey,
            sourceName: candidate.evidence?.sourceName ?? directory.source.attribution,
            sourceUrl: candidate.evidence?.sourceUrl ?? candidate.externalUrl,
            observedAt: directory.source.fetchedAt,
            confidence: candidate.confidence,
            extractedText: candidate.evidence?.extractedText,
          },
        ],
        externalLinks: [
          {
            label: "Zur Website des Vermieters",
            url: candidate.externalUrl,
            type: "website",
          },
          {
            label: "Originalquelle öffnen",
            url: candidate.evidence?.sourceUrl ?? candidate.externalUrl,
            type: "source",
          },
        ],
      };
    } catch {
      return null;
    }
  }

  private buildLandlordProfileFromListings(listings: any[]) {
    const activeListings = listings.filter((listing) => listing.status === ListingStatus.AVAILABLE);
    const prices = activeListings
      .map((listing) => listing.pricePerSqm ? Number(listing.pricePerSqm) : null)
      .filter((price): price is number => price !== null);
    const districts = Array.from(new Set(activeListings.map((listing) => listing.districtName).filter(Boolean)));
    const averagePricePerSqm = prices.length
      ? Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2))
      : null;
    const averageDataQuality = activeListings.length
      ? Math.round(activeListings.reduce((sum, listing) => sum + listing.dataQualityScore, 0) / activeListings.length)
      : 0;

    return {
      isExternalCandidate: false,
      knownListingsCount: listings.length,
      activeListingsCount: activeListings.length,
      averagePricePerSqm,
      activeDistricts: districts,
      lastUpdatedAt: activeListings[0]?.updatedAt ?? null,
      dataQuality: averageDataQuality,
      confidenceScore: averageDataQuality,
      summary: "Profil aus WohnCheck-Listings, Quellenhinweisen und Nutzerbewertungen.",
    };
  }

  private toLandlordListingCard(listing: any) {
    const districtMedian = listing.district?.rentPrices?.[0]?.valuePerSqm
      ? Number(listing.district.rentPrices[0].valuePerSqm)
      : null;

    return {
      id: listing.id,
      title: listing.title,
      address: [
        listing.street ? `${listing.street} ${listing.houseNumber ?? ""}`.trim() : listing.districtName,
        `${listing.postalCode ?? ""} ${listing.city}`.trim(),
      ].filter(Boolean).join(", "),
      city: listing.city,
      districtName: listing.districtName,
      livingAreaSqm: listing.livingAreaSqm ? Number(listing.livingAreaSqm) : null,
      rooms: listing.rooms ? Number(listing.rooms) : null,
      coldRent: listing.coldRent ? Number(listing.coldRent) : null,
      warmRent: listing.warmRent ? Number(listing.warmRent) : null,
      pricePerSqm: listing.pricePerSqm ? Number(listing.pricePerSqm) : null,
      districtMedianPricePerSqm: districtMedian,
      priceDeviationPercent: listing.priceDeviationPercent ? Number(listing.priceDeviationPercent) : null,
      status: listing.status,
      dataQualityScore: listing.dataQualityScore,
      sourceProvider: listing.sourceProvider ? {
        key: listing.sourceProvider.key,
        name: listing.sourceProvider.name,
        legalUseStatus: listing.sourceProvider.legalUseStatus,
        qualityScore: listing.sourceProvider.qualityScore?.overallScore ?? null,
      } : null,
    };
  }

  private async withReviewStats<T extends { id: string }>(targetType: TargetType, entries: T[]) {
    if (entries.length === 0) {
      return entries.map((entry) => ({
        ...entry,
        reviewCount: 0,
        ratingOverall: null,
        ratings: {},
      }));
    }

    const reviews = await this.prisma.review.findMany({
      where: {
        targetType,
        targetId: { in: entries.map((entry) => entry.id) },
        status: ReviewStatus.PUBLISHED,
        OR: [
          { verificationLevel: null },
          { verificationLevel: { not: "public-source-summary" } },
        ],
      },
      select: {
        targetId: true,
        overallRating: true,
        categoryRatings: true,
      },
    });

    const byTarget = new Map<
      string,
      {
        count: number;
        overallSum: number;
        categories: Map<string, { sum: number; count: number }>;
      }
    >();

    for (const review of reviews) {
      const current = byTarget.get(review.targetId) ?? {
        count: 0,
        overallSum: 0,
        categories: new Map<string, { sum: number; count: number }>(),
      };

      current.count += 1;
      current.overallSum += Number(review.overallRating);

      for (const [key, value] of Object.entries(review.categoryRatings as Record<string, number>)) {
        const category = current.categories.get(key) ?? { sum: 0, count: 0 };
        category.sum += Number(value);
        category.count += 1;
        current.categories.set(key, category);
      }

      byTarget.set(review.targetId, current);
    }

    return entries.map((entry) => {
      const stats = byTarget.get(entry.id);

      if (!stats) {
        return {
          ...entry,
          reviewCount: 0,
          ratingOverall: null,
          ratings: {},
        };
      }

      return {
        ...entry,
        reviewCount: stats.count,
        ratingOverall: Number((stats.overallSum / stats.count).toFixed(2)),
        ratings: Object.fromEntries(
          Array.from(stats.categories.entries()).map(([key, value]) => [
            key,
            Number((value.sum / value.count).toFixed(2)),
          ]),
        ),
      };
    });
  }

  private async getLatestScores(targetType: TargetType, targetIds: string[]) {
    const scores = await this.prisma.scoreResult.findMany({
      where: {
        targetType,
        targetId: { in: targetIds },
      },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        totalScore: true,
        confidenceScore: true,
        calculationVersion: true,
        computedAt: true,
      },
      orderBy: [{ targetId: "asc" }, { computedAt: "desc" }],
    });

    const latestByTarget = new Map<string, (typeof scores)[number]>();

    for (const score of scores) {
      if (!latestByTarget.has(score.targetId)) {
        latestByTarget.set(score.targetId, score);
      }
    }

    return latestByTarget;
  }
}
