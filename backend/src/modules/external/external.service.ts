import { Injectable, OnModuleInit } from "@nestjs/common";
import { MappingReportKind, MatchStatus, Prisma, ReporterRole } from "@prisma/client";
import {
  CreateMappingReportResponse,
  ExternalPlatformBlock,
  LandlordExternalResponse,
} from "../../common/api/api-types";
import { DiscoveredCompany, PublicLandlordLookupService } from "../companies/company.types";
import { JobHandlerRegistry } from "../jobs/job.types";
import { PrismaService } from "../prisma/prisma.service";
import { EXTERNAL_JOBS, PlatformCompanyContext } from "./external.types";
import { PLATFORM_PROVIDERS } from "./platform-providers";

export const EXTERNAL_DISCLAIMER =
  "Externe Plattformen sind unabhängig von WohnCheck. WohnCheck übernimmt dort keine Bewertungen, prüft die Inhalte nicht " +
  "und verrechnet sie nicht mit den WohnCheck-Bewertungen.";

const ORIGIN_LABELS: Record<string, string> = {
  wikidata: "Angabe laut Wikidata",
  manual: "Von WohnCheck geprüft",
  domain_derived: "Aus der Website abgeleitet",
  user_suggestion: "Hinweis von Nutzern",
};

@Injectable()
export class ExternalService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: PublicLandlordLookupService,
    private readonly registry: JobHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      type: EXTERNAL_JOBS.LINK_LANDLORD,
      handle: (payload) => this.linkLandlord((payload as { landlordId: string }).landlordId),
    });
  }

  /**
   * Network-free: turns platform ids stated by the landlord's source records (e.g. Wikidata P5161) into
   * ExternalReference rows. A source statement is PROBABLE unless it agrees with our own data (Trustpilot slug =
   * website domain), then CONFIRMED. A profile is never assigned to two landlords; rejected links stay rejected.
   */
  async linkLandlord(landlordId: string): Promise<{ created: number }> {
    const landlord = await this.prisma.landlord.findUnique({ where: { id: landlordId } });
    if (!landlord) return { created: 0 };
    const records = await this.prisma.sourceRecord.findMany({ where: { landlordId, removedAt: null } });
    let created = 0;
    for (const record of records) {
      const payload = record.payload as unknown as Pick<DiscoveredCompany, "externalReferences">;
      for (const ref of payload.externalReferences ?? []) {
        const provider = PLATFORM_PROVIDERS.find((p) => p.key === ref.platform);
        const parsed = provider?.referenceFromExternalId?.(ref.type, ref.externalId);
        if (!provider || !parsed) continue;
        const taken = await this.prisma.externalReference.findFirst({
          where: {
            platform: provider.key,
            url: parsed.url,
            OR: [{ matchStatus: MatchStatus.REJECTED, landlordId }, { landlordId: { not: landlordId }, matchStatus: { in: [MatchStatus.CONFIRMED, MatchStatus.PROBABLE] } }],
          },
        });
        if (taken) continue;
        const confirmed = provider.key === "trustpilot" && parsed.externalId === landlord.websiteDomain;
        const result = await this.prisma.externalReference.upsert({
          where: { landlordId_platform_url: { landlordId, platform: provider.key, url: parsed.url } },
          create: {
            landlordId,
            platform: provider.key,
            type: parsed.type,
            externalId: parsed.externalId,
            url: parsed.url,
            matchStatus: confirmed ? MatchStatus.CONFIRMED : MatchStatus.PROBABLE,
            origin: record.sourceKey,
            sourceRecordId: record.id,
            evidence: (parsed.evidence ?? undefined) as Prisma.InputJsonValue | undefined,
          },
          update: {},
        });
        if (result.createdAt.getTime() > Date.now() - 5_000) created++;
      }
    }
    return { created };
  }

  async externalFor(id: string): Promise<LandlordExternalResponse> {
    const { landlord, redirectedFromId } = await this.lookup.resolve(id);
    const [aliases, references] = await Promise.all([
      this.prisma.landlordAlias.findMany({ where: { landlordId: landlord.id }, select: { name: true } }),
      this.prisma.externalReference.findMany({
        where: { landlordId: landlord.id, matchStatus: { in: [MatchStatus.CONFIRMED, MatchStatus.PROBABLE] } },
        include: { location: { select: { id: true, name: true, city: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const context: PlatformCompanyContext = {
      landlordId: landlord.id,
      name: landlord.name,
      legalName: landlord.legalName,
      aliases: aliases.map((a) => a.name),
      city: landlord.city,
      postalCode: landlord.postalCode,
      website: landlord.website,
      websiteDomain: landlord.websiteDomain,
    };
    const platforms: ExternalPlatformBlock[] = PLATFORM_PROVIDERS.map((provider) => ({
      platform: provider.key,
      displayName: provider.displayName,
      mode: "link_only",
      notice: provider.notice,
      references: references
        .filter((r) => r.platform === provider.key)
        .map((r) => ({
          id: r.id,
          type: r.type,
          url: r.url,
          label: r.label ?? provider.describeReference({ type: r.type, externalId: r.externalId, url: r.url, evidence: r.evidence }),
          topicLabels: [],
          matchStatus: r.matchStatus === MatchStatus.CONFIRMED ? "CONFIRMED" : "PROBABLE",
          matchHint: r.matchStatus === MatchStatus.PROBABLE ? "Zuordnung nicht abschließend geprüft" : null,
          originLabel: ORIGIN_LABELS[r.origin] ?? "Aus offener Quelle",
          location: r.location ? { id: r.location.id, name: r.location.name, city: r.location.city } : null,
          verifiedAt: r.verifiedAt?.toISOString() ?? null,
        })),
      searchLinks: provider.buildSearchLinks(context),
    }));
    return {
      landlordId: landlord.id,
      redirectedFromId,
      disclaimer: EXTERNAL_DISCLAIMER,
      platforms,
      helpLinks: [{ label: "Mieterverein vor Ort finden", url: "https://mieterbund.de/mieterverein-vor-ort/" }],
    };
  }

  async createReport(
    id: string,
    input: { kind: MappingReportKind; reporterRole?: ReporterRole; message: string; externalReferenceId?: string; reviewId?: string; contactEmail?: string },
    reporterUserId: string | null,
  ): Promise<CreateMappingReportResponse> {
    const { landlord } = await this.lookup.resolve(id);
    const report = await this.prisma.mappingReport.create({
      data: {
        landlordId: landlord.id,
        kind: input.kind,
        reporterRole: input.reporterRole ?? ReporterRole.OTHER,
        message: input.message.trim(),
        externalReferenceId: input.externalReferenceId ?? null,
        reviewId: input.reviewId ?? null,
        contactEmail: input.contactEmail?.trim() || null,
        reporterUserId,
      },
    });
    return { id: report.id, status: "OPEN" };
  }
}
