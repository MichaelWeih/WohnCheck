import { Injectable, OnModuleInit } from "@nestjs/common";
import { AliasType, Landlord, MergeCandidateStatus, RecordStatus } from "@prisma/client";
import { JobHandlerRegistry } from "../jobs/job.types";
import { PrismaService } from "../prisma/prisma.service";
import { COMPANY_JOBS, LegalFormCode } from "./company.types";
import { MatchSubject, scoreCompanyMatch } from "./matching";
import { orderedPair } from "./normalization";

/**
 * companies.find-duplicates (local, no network):
 * 1. re-scores every PENDING MergeCandidate with the current matching rules and drops pairs that are now "different";
 * 2. proposes pairs with an identical core name or website domain that have no candidate row yet.
 * Nothing is merged automatically — the pairs go to the admin review queue.
 */
@Injectable()
export class DuplicateFinderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({ type: COMPANY_JOBS.FIND_DUPLICATES, timeoutMs: 300_000, handle: () => this.run() });
    this.registry.registerSchedule({
      key: COMPANY_JOBS.FIND_DUPLICATES,
      type: COMPANY_JOBS.FIND_DUPLICATES,
      dedupeKey: COMPANY_JOBS.FIND_DUPLICATES,
      intervalMinutes: 24 * 60,
    });
  }

  private async subject(landlord: Landlord): Promise<MatchSubject> {
    const [aliases, identifiers] = await Promise.all([
      this.prisma.landlordAlias.findMany({ where: { landlordId: landlord.id } }),
      this.prisma.landlordIdentifier.findMany({ where: { landlordId: landlord.id } }),
    ]);
    return {
      names: [
        { normalized: landlord.normalizedName, legalForm: (landlord.legalForm as LegalFormCode | null) ?? null, kind: "primary" as const },
        ...aliases.map((a) => ({
          normalized: a.normalizedName,
          legalForm: (a.legalForm as LegalFormCode | null) ?? null,
          kind: a.type === AliasType.LEGAL_NAME ? ("legal" as const) : ("alias" as const),
        })),
      ].filter((n) => n.normalized),
      identifiers: identifiers.map((i) => ({ scheme: i.scheme, value: i.value })),
      websiteDomain: landlord.websiteDomain,
      postalCode: landlord.postalCode,
      city: landlord.city,
    };
  }

  async run(): Promise<{ removed: number; rescored: number; added: number }> {
    let removed = 0;
    let rescored = 0;
    let added = 0;
    const pending = await this.prisma.mergeCandidate.findMany({
      where: { status: MergeCandidateStatus.PENDING },
      include: { landlordA: true, landlordB: true },
    });
    for (const pair of pending) {
      const result = scoreCompanyMatch(await this.subject(pair.landlordA), await this.subject(pair.landlordB));
      if (result.decision === "different") {
        await this.prisma.mergeCandidate.delete({ where: { id: pair.id } });
        removed++;
      } else {
        await this.prisma.mergeCandidate.update({ where: { id: pair.id }, data: { score: result.score, reasons: result.reasons } });
        rescored++;
      }
    }

    const statuses = [RecordStatus.ACTIVE, RecordStatus.CANDIDATE];
    const groups = await this.prisma.$queryRaw<Array<{ ids: string[] }>>`
      SELECT array_agg("id" ORDER BY "id") AS ids FROM "Landlord"
      WHERE "status" = ANY(${statuses}::"RecordStatus"[]) AND "normalizedName" <> ''
      GROUP BY "normalizedName" HAVING count(*) > 1
      UNION ALL
      SELECT array_agg("id" ORDER BY "id") FROM "Landlord"
      WHERE "status" = ANY(${statuses}::"RecordStatus"[]) AND "websiteDomain" IS NOT NULL
      GROUP BY "websiteDomain" HAVING count(*) > 1`;
    for (const group of groups) {
      const ids = group.ids.slice(0, 20);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = orderedPair(ids[i], ids[j]);
          if (await this.prisma.mergeCandidate.findUnique({ where: { landlordAId_landlordBId: { landlordAId: a, landlordBId: b } } })) continue;
          const [la, lb] = await Promise.all([
            this.prisma.landlord.findUniqueOrThrow({ where: { id: a } }),
            this.prisma.landlord.findUniqueOrThrow({ where: { id: b } }),
          ]);
          const result = scoreCompanyMatch(await this.subject(la), await this.subject(lb));
          if (result.decision === "different") continue;
          await this.prisma.mergeCandidate.create({ data: { landlordAId: a, landlordBId: b, score: result.score, reasons: result.reasons } });
          added++;
        }
    }
    return { removed, rescored, added };
  }
}
