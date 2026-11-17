import { Injectable, NotFoundException } from "@nestjs/common";
import { LegalUseStatus, ListingStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ListingQueryDto } from "./dto/listing-query.dto";

type Bbox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListingQueryDto) {
    const where = this.buildWhere(query);
    const take = this.clamp(this.toNumber(query.limit) ?? 50, 1, 100);
    const skip = this.clamp(this.toNumber(query.offset) ?? 0, 0, 10_000);

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          landlord: true,
          district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
          sourceProvider: { include: { qualityScore: true } },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take,
        skip,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      total,
      limit: take,
      offset: skip,
      items: items.map((listing) => this.toListingCard(listing)),
    };
  }

  async findForMap(query: ListingQueryDto) {
    const where = this.buildWhere(query, true);
    const listings = await this.prisma.listing.findMany({
      where,
      include: {
        landlord: true,
        district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
        sourceProvider: true,
      },
      take: 1000,
      orderBy: { updatedAt: "desc" },
    });

    return {
      generatedAt: new Date().toISOString(),
      bbox: query.bbox ?? null,
      count: listings.length,
      clusterReady: true,
      markers: listings.map((listing) => ({
        id: listing.id,
        type: "listing",
        title: listing.title,
        latitude: listing.latitude ? Number(listing.latitude) : null,
        longitude: listing.longitude ? Number(listing.longitude) : null,
        geoAccuracy: listing.geoAccuracy,
        city: listing.city,
        districtName: listing.districtName,
        coldRent: listing.coldRent ? Number(listing.coldRent) : null,
        warmRent: listing.warmRent ? Number(listing.warmRent) : null,
        livingAreaSqm: listing.livingAreaSqm ? Number(listing.livingAreaSqm) : null,
        rooms: listing.rooms ? Number(listing.rooms) : null,
        pricePerSqm: listing.pricePerSqm ? Number(listing.pricePerSqm) : null,
        priceDeviationPercent: listing.priceDeviationPercent ? Number(listing.priceDeviationPercent) : null,
        status: listing.status,
        scorePreview: listing.scorePreview,
        dataQualityScore: listing.dataQualityScore,
        landlord: listing.landlord ? {
          id: listing.landlord.id,
          name: listing.landlord.name,
          providerKind: listing.landlord.landlordType,
        } : null,
        sourceProvider: listing.sourceProvider ? {
          key: listing.sourceProvider.key,
          name: listing.sourceProvider.name,
          providerKind: listing.sourceProvider.providerKind,
        } : null,
      })),
    };
  }

  async findById(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        landlord: { include: { profile: true } },
        district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
        sourceProvider: { include: { qualityScore: true } },
        sources: { include: { sourceProvider: true }, orderBy: { fetchedAt: "desc" } },
      },
    });

    if (!listing) {
      throw new NotFoundException("Listing nicht gefunden");
    }

    return this.toListingDetail(listing);
  }

  async findSources(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        sources: { include: { sourceProvider: { include: { qualityScore: true } } }, orderBy: { fetchedAt: "desc" } },
      },
    });

    if (!listing) {
      throw new NotFoundException("Listing nicht gefunden");
    }

    return {
      listingId: id,
      sources: listing.sources.map((source) => ({
        id: source.id,
        method: source.method,
        sourceUrl: source.sourceUrl,
        externalId: source.externalId,
        fetchedAt: source.fetchedAt,
        publishedAt: source.publishedAt,
        legalUseStatus: source.legalUseStatus,
        provider: source.sourceProvider ? {
          key: source.sourceProvider.key,
          name: source.sourceProvider.name,
          providerKind: source.sourceProvider.providerKind,
          legalUseStatus: source.sourceProvider.legalUseStatus,
          qualityScore: source.sourceProvider.qualityScore?.overallScore ?? null,
        } : null,
      })),
    };
  }

  async getMapLayers() {
    return {
      layers: [
        {
          key: "listings",
          label: "Freie Wohnungen",
          endpoint: "/api/map/layers/listings",
          supportsBbox: true,
          supportsFilters: ["price", "rooms", "area", "district", "providerKind"],
        },
        {
          key: "district-rent-prices",
          label: "Quadratmeterpreise nach Stadtteil",
          endpoint: "/api/map/layers/district-rent-prices",
          supportsBbox: false,
          supportsFilters: ["city"],
        },
      ],
    };
  }

  async getDistrictRentPriceLayer(query: ListingQueryDto) {
    const districts = await this.prisma.district.findMany({
      where: {
        city: query.city ? { equals: query.city, mode: "insensitive" } : undefined,
      },
      include: {
        rentPrices: {
          where: { metric: "rent_cold" },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      take: 500,
      orderBy: [{ city: "asc" }, { name: "asc" }],
    });

    return {
      generatedAt: new Date().toISOString(),
      layer: "district-rent-prices",
      areas: districts.map((district) => ({
        id: district.id,
        name: district.name,
        city: district.city,
        postalCode: district.postalCode,
        centroidLat: district.centroidLat ? Number(district.centroidLat) : null,
        centroidLon: district.centroidLon ? Number(district.centroidLon) : null,
        rentMedian: district.rentPrices[0]?.valuePerSqm ? Number(district.rentPrices[0].valuePerSqm) : null,
        periodLabel: district.rentPrices[0]?.periodLabel ?? null,
        sourceKey: district.rentPrices[0]?.sourceKey ?? null,
      })),
    };
  }

  async findByLandlord(landlordId: string, query: ListingQueryDto = {}) {
    return this.findAll({ ...query, limit: query.limit ?? "100", status: query.status ?? ListingStatus.AVAILABLE } as ListingQueryDto & { landlordId?: string });
  }

  buildLandlordListingsWhere(landlordId: string) {
    return { landlordId };
  }

  private buildWhere(query: ListingQueryDto, requireCoordinates = false): Prisma.ListingWhereInput {
    const bbox = this.parseBbox(query.bbox);

    return {
      status: query.status ?? ListingStatus.AVAILABLE,
      city: query.city ? { equals: query.city, mode: "insensitive" } : undefined,
      districtName: query.district ? { contains: query.district, mode: "insensitive" } : undefined,
      coldRent: this.rangeFilter(query.minRent, query.maxRent),
      rooms: this.rangeFilter(query.minRooms, query.maxRooms),
      livingAreaSqm: this.rangeFilter(query.minArea, query.maxArea),
      latitude: bbox
        ? { gte: bbox.minLat, lte: bbox.maxLat }
        : requireCoordinates ? { not: null } : undefined,
      longitude: bbox
        ? { gte: bbox.minLon, lte: bbox.maxLon }
        : requireCoordinates ? { not: null } : undefined,
      landlord: query.providerKind ? { landlordType: query.providerKind } : undefined,
      legalUseStatus: { not: LegalUseStatus.BLOCKED },
    };
  }

  private toListingCard(listing: any) {
    const districtMedian = listing.district?.rentPrices?.[0]?.valuePerSqm ? Number(listing.district.rentPrices[0].valuePerSqm) : null;

    return {
      id: listing.id,
      title: listing.title,
      address: this.formatAddress(listing),
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
      geoAccuracy: listing.geoAccuracy,
      dataQualityScore: listing.dataQualityScore,
      scorePreview: listing.scorePreview,
      landlord: listing.landlord ? {
        id: listing.landlord.id,
        name: listing.landlord.name,
        providerKind: listing.landlord.landlordType,
      } : null,
      sourceProvider: listing.sourceProvider ? {
        key: listing.sourceProvider.key,
        name: listing.sourceProvider.name,
        legalUseStatus: listing.sourceProvider.legalUseStatus,
        qualityScore: listing.sourceProvider.qualityScore?.overallScore ?? null,
      } : null,
    };
  }

  private toListingDetail(listing: any) {
    return {
      ...this.toListingCard(listing),
      latitude: listing.latitude ? Number(listing.latitude) : null,
      longitude: listing.longitude ? Number(listing.longitude) : null,
      sourceUrl: listing.sourceUrl,
      externalLinks: listing.sourceUrl ? [{ label: "Originalangebot öffnen", url: listing.sourceUrl, type: "listing" }] : [],
      availableFrom: listing.availableFrom,
      firstSeenAt: listing.firstSeenAt,
      lastSeenAt: listing.lastSeenAt,
      sources: listing.sources?.map((source: any) => ({
        id: source.id,
        method: source.method,
        sourceUrl: source.sourceUrl,
        legalUseStatus: source.legalUseStatus,
        providerName: source.sourceProvider?.name ?? null,
      })) ?? [],
    };
  }

  private formatAddress(listing: { street?: string | null; houseNumber?: string | null; postalCode?: string | null; city: string; districtName?: string | null }) {
    if (!listing.street) {
      return [listing.districtName, listing.postalCode, listing.city].filter(Boolean).join(", ");
    }

    return [`${listing.street} ${listing.houseNumber ?? ""}`.trim(), `${listing.postalCode ?? ""} ${listing.city}`.trim()].filter(Boolean).join(", ");
  }

  private parseBbox(value?: string): Bbox | null {
    if (!value) return null;
    const parts = value.split(",").map((part) => Number(part.trim()));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
    const [minLon, minLat, maxLon, maxLat] = parts;
    return { minLon, minLat, maxLon, maxLat };
  }

  private rangeFilter(min?: string, max?: string) {
    const gte = this.toNumber(min);
    const lte = this.toNumber(max);
    if (gte === null && lte === null) return undefined;
    return { gte: gte ?? undefined, lte: lte ?? undefined };
  }

  private toNumber(value?: string) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }
}
