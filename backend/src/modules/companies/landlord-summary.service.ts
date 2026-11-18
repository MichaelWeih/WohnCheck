import { Injectable } from "@nestjs/common";
import { Landlord, RecordStatus, ReviewStatus, TargetType, VerificationStatus } from "@prisma/client";
import { GermanStateCode, LandlordRef, LandlordSummary } from "../../common/api/api-types";
import { germanStateLabel, isGermanStateCode } from "../../common/geo/german-states";
import { PrismaService } from "../prisma/prisma.service";
import { companyKindLabel } from "./company-kind";
import { LandlordSummaryService } from "./company.types";

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: "Nicht geprüft",
  AUTO_VERIFIED: "Automatisch verifiziert",
  MANUALLY_VERIFIED: "Von WohnCheck geprüft",
};

/** Columns needed for a public card — never the internal ones (confidence, normalizedName, fieldSources). */
export const SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  companyType: true,
  city: true,
  state: true,
  website: true,
  verificationStatus: true,
  operationalStatus: true,
} as const;

type SummaryRow = Pick<Landlord, keyof typeof SUMMARY_SELECT>;

/** Reviews that count for the own WohnCheck rating: published, own users, no editorial summaries. */
export const OWN_REVIEW_FILTER = {
  status: ReviewStatus.PUBLISHED,
  OR: [{ verificationLevel: null }, { verificationLevel: { not: "public-source-summary" } }],
};

@Injectable()
export class LandlordSummaryServiceImpl implements LandlordSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(ids: string[]): Promise<LandlordSummary[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const [rows, ratings] = await Promise.all([
      this.prisma.landlord.findMany({
        where: { id: { in: unique }, status: RecordStatus.ACTIVE },
        select: SUMMARY_SELECT,
      }),
      this.ratingStats(unique),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return unique.flatMap((id) => {
      const row = byId.get(id);
      return row ? [this.toSummary(row, ratings.get(id))] : [];
    });
  }

  /** One grouped query for all ids; null average when there are no published reviews. */
  async ratingStats(ids: string[]): Promise<Map<string, { ratingOverall: number | null; reviewCount: number }>> {
    if (!ids.length) return new Map();
    const groups = await this.prisma.review.groupBy({
      by: ["targetId"],
      where: { targetType: TargetType.LANDLORD, targetId: { in: ids }, ...OWN_REVIEW_FILTER },
      _avg: { overallRating: true },
      _count: { _all: true },
    });
    return new Map(
      groups.map((group) => [
        group.targetId,
        {
          ratingOverall:
            group._avg.overallRating === null ? null : Number(Number(group._avg.overallRating).toFixed(2)),
          reviewCount: group._count._all,
        },
      ]),
    );
  }

  toSummary(row: SummaryRow, rating?: { ratingOverall: number | null; reviewCount: number }): LandlordSummary {
    const state: GermanStateCode | null = isGermanStateCode(row.state) ? row.state : null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      kindLabel: companyKindLabel(row.kind),
      companyType: row.companyType,
      city: row.city,
      state,
      stateLabel: germanStateLabel(state) ?? null,
      website: row.website,
      verificationStatus: row.verificationStatus,
      verificationLabel: VERIFICATION_LABELS[row.verificationStatus],
      operationalStatus: row.operationalStatus,
      ratingOverall: rating?.ratingOverall ?? null,
      reviewCount: rating?.reviewCount ?? 0,
    };
  }

  toRef(landlord: Pick<Landlord, "id" | "slug" | "name" | "kind" | "city">): LandlordRef {
    return {
      id: landlord.id,
      slug: landlord.slug,
      name: landlord.name,
      kindLabel: companyKindLabel(landlord.kind),
      city: landlord.city,
    };
  }
}
