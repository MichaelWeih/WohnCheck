import { BadRequestException, Injectable } from "@nestjs/common";
import { ImportJobStatus, LegalUseStatus, ListingSourceMethod, ListingStatus, Prisma, ProviderKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DuplicateDetectionService } from "../listings/pipeline/duplicate-detection.service";
import { LandlordResolver } from "../listings/pipeline/landlord-resolver.service";
import { ListingNormalizer } from "../listings/pipeline/listing-normalizer.service";
import { ListingValidator } from "../listings/pipeline/listing-validator.service";
import { ImportListingsDto } from "./dto/import-listings.dto";

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: ListingNormalizer,
    private readonly validator: ListingValidator,
    private readonly landlordResolver: LandlordResolver,
    private readonly duplicateDetection: DuplicateDetectionService,
  ) {}

  getJobs() {
    return this.prisma.importJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async importListings(dto: ImportListingsDto) {
    const records = dto.records ?? (dto.csv ? this.parseCsv(dto.csv) : []);

    if (records.length === 0) {
      throw new BadRequestException("Keine Importdaten übergeben");
    }

    const sourceKey = dto.sourceKey ?? "admin-manual-import";
    const method = dto.method ?? (dto.csv ? ListingSourceMethod.CSV_IMPORT : ListingSourceMethod.JSON_IMPORT);
    const providerKind = dto.providerKind ?? ProviderKind.MANUAL;
    const sourceProvider = await this.ensureSourceProvider(sourceKey, dto.sourceName ?? "Admin-Import", method, providerKind);
    const job = await this.prisma.importJob.create({
      data: {
        sourceKey,
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    let importedCount = 0;
    const errors: Array<{ index: number; errors: string[] }> = [];

    for (const [index, record] of records.entries()) {
      const normalized = this.normalizer.normalize(record);
      const validation = this.validator.validate(normalized);

      if (!validation.isValid) {
        errors.push({ index, errors: validation.errors });
        continue;
      }

      const landlord = await this.landlordResolver.resolveByName(
        this.toString(record.landlordName ?? record.vermieter ?? record.anbieter),
        normalized.city,
        providerKind,
      );
      const district = normalized.districtName
        ? await this.prisma.district.findFirst({
            where: {
              city: { equals: normalized.city, mode: "insensitive" },
              name: { equals: normalized.districtName, mode: "insensitive" },
            },
          })
        : null;
      const priceDeviationPercent = normalized.pricePerSqm && district
        ? await this.calculatePriceDeviation(normalized.pricePerSqm, district.id)
        : null;
      const canonicalKey = this.buildCanonicalKey(sourceKey, normalized);

      const listing = await this.prisma.listing.upsert({
        where: { canonicalKey },
        update: {
          ...this.toPrismaListingData(normalized, validation.dataQualityScore, priceDeviationPercent),
          landlordId: landlord?.id,
          districtId: district?.id,
          sourceProviderId: sourceProvider.id,
          status: ListingStatus.NEEDS_REVIEW,
          legalUseStatus: LegalUseStatus.MANUAL,
          lastSeenAt: new Date(),
        },
        create: {
          canonicalKey,
          ...this.toPrismaListingData(normalized, validation.dataQualityScore, priceDeviationPercent),
          landlordId: landlord?.id,
          districtId: district?.id,
          sourceProviderId: sourceProvider.id,
          status: ListingStatus.NEEDS_REVIEW,
          legalUseStatus: LegalUseStatus.MANUAL,
        },
      });

      await this.prisma.listingSource.create({
        data: {
          listingId: listing.id,
          sourceProviderId: sourceProvider.id,
          method,
          sourceUrl: normalized.sourceUrl,
          externalId: normalized.externalId,
          legalUseStatus: LegalUseStatus.MANUAL,
          payload: record as Prisma.InputJsonObject,
        },
      });

      const duplicates = await this.duplicateDetection.findCandidates({
        listingId: listing.id,
        city: normalized.city,
        street: normalized.street,
        houseNumber: normalized.houseNumber,
        livingAreaSqm: normalized.livingAreaSqm,
        rooms: normalized.rooms,
        coldRent: normalized.coldRent,
      });

      for (const duplicate of duplicates.slice(0, 3)) {
        await this.prisma.duplicateCandidate.upsert({
          where: {
            listingId_possibleDuplicateId: {
              listingId: listing.id,
              possibleDuplicateId: duplicate.candidate.id,
            },
          },
          update: {
            confidence: duplicate.confidence,
            reasons: duplicate.reasons,
          },
          create: {
            listingId: listing.id,
            possibleDuplicateId: duplicate.candidate.id,
            confidence: duplicate.confidence,
            reasons: duplicate.reasons,
          },
        });
      }

      importedCount += 1;
    }

    return this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors.length === records.length ? ImportJobStatus.FAILED : ImportJobStatus.SUCCEEDED,
        message: JSON.stringify({ received: records.length, importedCount, errors }),
        finishedAt: new Date(),
      },
    });
  }

  private async ensureSourceProvider(key: string, name: string, method: ListingSourceMethod, providerKind: ProviderKind) {
    return this.prisma.sourceProvider.upsert({
      where: { key },
      update: { name, method, providerKind, legalUseStatus: LegalUseStatus.MANUAL },
      create: {
        key,
        name,
        method,
        providerKind,
        legalUseStatus: LegalUseStatus.MANUAL,
        robotsStatus: "not_required",
        termsStatus: "manual_or_partner_import",
      },
    });
  }

  private async calculatePriceDeviation(pricePerSqm: number, districtId: string) {
    const price = await this.prisma.districtRentPrice.findFirst({
      where: { districtId, metric: "rent_cold" },
      orderBy: { updatedAt: "desc" },
    });

    if (!price) return null;
    const median = Number(price.valuePerSqm);
    return Number((((pricePerSqm - median) / median) * 100).toFixed(2));
  }

  private toPrismaListingData(normalized: ReturnType<ListingNormalizer["normalize"]>, dataQualityScore: number, priceDeviationPercent: number | null) {
    return {
      title: normalized.title,
      street: normalized.street,
      houseNumber: normalized.houseNumber,
      postalCode: normalized.postalCode,
      city: normalized.city,
      districtName: normalized.districtName,
      latitude: normalized.latitude !== null ? new Prisma.Decimal(normalized.latitude) : null,
      longitude: normalized.longitude !== null ? new Prisma.Decimal(normalized.longitude) : null,
      livingAreaSqm: normalized.livingAreaSqm !== null ? new Prisma.Decimal(normalized.livingAreaSqm) : null,
      rooms: normalized.rooms !== null ? new Prisma.Decimal(normalized.rooms) : null,
      coldRent: normalized.coldRent !== null ? new Prisma.Decimal(normalized.coldRent) : null,
      warmRent: normalized.warmRent !== null ? new Prisma.Decimal(normalized.warmRent) : null,
      pricePerSqm: normalized.pricePerSqm !== null ? new Prisma.Decimal(normalized.pricePerSqm) : null,
      sourceUrl: normalized.sourceUrl,
      externalId: normalized.externalId,
      dataQualityScore,
      priceDeviationPercent: priceDeviationPercent !== null ? new Prisma.Decimal(priceDeviationPercent) : null,
      scorePreview: Math.round(Math.max(30, Math.min(95, dataQualityScore - Math.max(0, priceDeviationPercent ?? 0) * 0.25))),
    };
  }

  private buildCanonicalKey(sourceKey: string, normalized: ReturnType<ListingNormalizer["normalize"]>) {
    const parts = [
      sourceKey,
      normalized.externalId,
      normalized.city,
      normalized.street,
      normalized.houseNumber,
      normalized.livingAreaSqm,
      normalized.rooms,
      normalized.coldRent,
    ];

    return parts.filter(Boolean).join(":").toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  private parseCsv(csv: string) {
    const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = this.splitCsvLine(lines[0]);

    return lines.slice(1).map((line) => {
      const values = this.splitCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
  }

  private splitCsvLine(line: string) {
    return line.split(";").map((part) => part.trim());
  }

  private toString(value: unknown) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }
}
