import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AliasType,
  IdentifierScheme,
  Landlord,
  LocationType,
  MergeCandidateStatus,
  Prisma,
  RecordStatus,
  ReviewStatus,
  TargetType,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompanyMergeService, MergeActor } from "./company.types";
import { normalizeCompanyName, orderedPair } from "./normalization";

type Tx = Prisma.TransactionClient;
const IDENTITY_LOCK = 727001;

/** Columns copied from the loser when the survivor has no value. */
const FILLABLE: Array<keyof Landlord> = ["legalName", "legalForm", "city", "postalCode", "state", "website", "websiteDomain"];

interface Snapshot {
  loser: Record<string, unknown>;
  survivorBefore: Record<string, unknown>;
  moved: Record<string, string[]>;
  skippedReviews: string[];
  addedAliasIds: string[];
}

/**
 * Admin merge of two records of the same legal entity (docs/vermieter-verzeichnis.md 3.4), serialised with the
 * identity lock. Everything that hangs on the loser is moved to the survivor; the loser becomes MERGED and keeps
 * resolving to the survivor. The journal (LandlordMerge.snapshot) lists every moved row so the merge can be undone.
 * Different LEIs can never be merged, not even with force.
 */
@Injectable()
export class CompanyMergeServiceImpl implements CompanyMergeService {
  constructor(private readonly prisma: PrismaService) {}

  async merge(survivorId: string, loserId: string, actor: MergeActor, options: { force?: boolean } = {}): Promise<{ mergeId: string }> {
    if (survivorId === loserId) throw new BadRequestException("Ein Datensatz kann nicht mit sich selbst zusammengeführt werden.");
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IDENTITY_LOCK})`;
        const [first, second] = orderedPair(survivorId, loserId);
        await tx.$queryRaw`SELECT "id" FROM "Landlord" WHERE "id" IN (${first}, ${second}) ORDER BY "id" FOR UPDATE`;
        const survivor = await tx.landlord.findUnique({ where: { id: survivorId } });
        const loser = await tx.landlord.findUnique({ where: { id: loserId } });
        if (!survivor || !loser) throw new NotFoundException("Vermieter nicht gefunden.");
        const allowed: RecordStatus[] = [RecordStatus.ACTIVE, RecordStatus.CANDIDATE];
        if (!allowed.includes(survivor.status) || !allowed.includes(loser.status))
          throw new BadRequestException("Nur aktive oder Kandidaten-Datensätze können zusammengeführt werden.");
        const leis = await tx.landlordIdentifier.findMany({ where: { landlordId: { in: [survivorId, loserId] }, scheme: IdentifierScheme.LEI } });
        if (new Set(leis.map((l) => l.value)).size > 1)
          throw new BadRequestException("Unterschiedliche LEI: das sind verschiedene juristische Personen.");
        const [a, b] = orderedPair(survivorId, loserId);
        const pair = await tx.mergeCandidate.findUnique({ where: { landlordAId_landlordBId: { landlordAId: a, landlordBId: b } } });
        if (!options.force && (pair?.status === MergeCandidateStatus.DISTINCT || loser.verificationStatus === VerificationStatus.MANUALLY_VERIFIED))
          throw new BadRequestException("Dieses Paar wurde als verschieden entschieden oder ist geprüft; nur mit force zusammenführbar.");

        const snapshot: Snapshot = { loser: { ...loser }, survivorBefore: {}, moved: {}, skippedReviews: [], addedAliasIds: [] };
        const record = (table: string, ids: string[]) => {
          if (ids.length) snapshot.moved[table] = [...(snapshot.moved[table] ?? []), ...ids];
        };

        // Aliases (duplicates by name are dropped from the loser).
        const survivorAliases = new Set((await tx.landlordAlias.findMany({ where: { landlordId: survivorId } })).map((x) => x.name));
        for (const alias of await tx.landlordAlias.findMany({ where: { landlordId: loserId } })) {
          if (survivorAliases.has(alias.name)) continue;
          await tx.landlordAlias.update({ where: { id: alias.id }, data: { landlordId: survivorId } });
          record("LandlordAlias", [alias.id]);
        }
        // The loser's names stay findable.
        for (const [name, type] of [[loser.name, AliasType.SPELLING], [loser.legalName, AliasType.LEGAL_NAME]] as const) {
          if (!name || name === survivor.name || survivorAliases.has(name)) continue;
          const n = normalizeCompanyName(name);
          if (!n.normalized) continue;
          const created = await tx.landlordAlias.create({
            data: { landlordId: survivorId, name, normalizedName: n.normalized, legalForm: n.legalForm, type, source: "merge" },
          });
          survivorAliases.add(name);
          snapshot.addedAliasIds.push(created.id);
        }

        const moveSimple = async (table: string, rows: Array<{ id: string }>, update: (id: string) => Promise<unknown>) => {
          for (const row of rows) await update(row.id);
          record(table, rows.map((r) => r.id));
        };
        await moveSimple("LandlordIdentifier", await tx.landlordIdentifier.findMany({ where: { landlordId: loserId } }), (id) =>
          tx.landlordIdentifier.update({ where: { id }, data: { landlordId: survivorId } }),
        );
        const hasHq = await tx.landlordLocation.findFirst({ where: { landlordId: survivorId, type: LocationType.HEADQUARTERS } });
        await moveSimple("LandlordLocation", await tx.landlordLocation.findMany({ where: { landlordId: loserId } }), (id) =>
          tx.landlordLocation.update({ where: { id }, data: { landlordId: survivorId, ...(hasHq ? { type: LocationType.BRANCH } : {}) } }),
        );
        await moveSimple("SourceRecord", await tx.sourceRecord.findMany({ where: { landlordId: loserId } }), (id) =>
          tx.sourceRecord.update({ where: { id }, data: { landlordId: survivorId } }),
        );
        const survivorRefs = new Set((await tx.externalReference.findMany({ where: { landlordId: survivorId } })).map((r) => `${r.platform}|${r.url}`));
        for (const ref of await tx.externalReference.findMany({ where: { landlordId: loserId } })) {
          if (survivorRefs.has(`${ref.platform}|${ref.url}`)) continue;
          await tx.externalReference.update({ where: { id: ref.id }, data: { landlordId: survivorId } });
          record("ExternalReference", [ref.id]);
        }
        await moveSimple("MappingReport", await tx.mappingReport.findMany({ where: { landlordId: loserId } }), (id) =>
          tx.mappingReport.update({ where: { id }, data: { landlordId: survivorId } }),
        );
        for (const relation of await tx.companyRelation.findMany({ where: { OR: [{ fromLandlordId: loserId }, { toLandlordId: loserId }] } })) {
          const from = relation.fromLandlordId === loserId ? survivorId : relation.fromLandlordId;
          const to = relation.toLandlordId === loserId ? survivorId : relation.toLandlordId;
          const duplicate = await tx.companyRelation.findUnique({ where: { fromLandlordId_toLandlordId_type: { fromLandlordId: from, toLandlordId: to, type: relation.type } } });
          if (from === to || duplicate) continue;
          await tx.companyRelation.update({ where: { id: relation.id }, data: { fromLandlordId: from, toLandlordId: to } });
          record("CompanyRelation", [relation.id]);
        }
        await moveSimple("Property", await tx.property.findMany({ where: { landlordId: loserId }, select: { id: true } }), (id) =>
          tx.property.update({ where: { id }, data: { landlordId: survivorId } }),
        );
        for (const party of await tx.propertyParty.findMany({ where: { landlordId: loserId } })) {
          const duplicate = await tx.propertyParty.findUnique({
            where: { propertyId_landlordId_role: { propertyId: party.propertyId, landlordId: survivorId, role: party.role } },
          });
          if (duplicate) continue;
          await tx.propertyParty.update({ where: { id: party.id }, data: { landlordId: survivorId } });
          record("PropertyParty", [party.id]);
        }
        await moveSimple("User", await tx.user.findMany({ where: { landlordId: loserId }, select: { id: true } }), (id) =>
          tx.user.update({ where: { id }, data: { landlordId: survivorId } }),
        );
        await moveSimple("Listing", await tx.listing.findMany({ where: { landlordId: loserId }, select: { id: true } }), (id) =>
          tx.listing.update({ where: { id }, data: { landlordId: survivorId } }),
        );
        // Reviews: a user keeps at most one active review per landlord; a second one stays on the old id.
        const reviewers = new Set(
          (await tx.review.findMany({ where: { targetType: TargetType.LANDLORD, targetId: survivorId, status: { not: ReviewStatus.REJECTED } }, select: { userId: true } })).map((r) => r.userId),
        );
        for (const review of await tx.review.findMany({ where: { targetType: TargetType.LANDLORD, targetId: loserId } })) {
          if (review.status !== ReviewStatus.REJECTED && reviewers.has(review.userId)) {
            snapshot.skippedReviews.push(review.id);
            continue;
          }
          await tx.review.update({ where: { id: review.id }, data: { targetId: survivorId } });
          record("Review", [review.id]);
        }
        await tx.scoreResult.deleteMany({ where: { targetType: TargetType.LANDLORD, targetId: loserId } });

        // Earlier losers of the loser now point to the survivor.
        await moveSimple("Landlord.mergedInto", await tx.landlord.findMany({ where: { mergedIntoId: loserId }, select: { id: true } }), (id) =>
          tx.landlord.update({ where: { id }, data: { mergedIntoId: survivorId } }),
        );

        // Fill empty survivor fields from the loser.
        const fill: Prisma.LandlordUpdateInput = {};
        for (const field of FILLABLE) {
          if ((survivor[field] === null || survivor[field] === "") && loser[field] !== null && loser[field] !== "") {
            snapshot.survivorBefore[field] = survivor[field];
            (fill as Record<string, unknown>)[field] = loser[field];
          }
        }
        if (survivor.status === RecordStatus.CANDIDATE && loser.status === RecordStatus.ACTIVE) {
          snapshot.survivorBefore.status = survivor.status;
          fill.status = RecordStatus.ACTIVE;
        }
        if (Object.keys(fill).length) await tx.landlord.update({ where: { id: survivorId }, data: fill });
        await tx.landlord.update({ where: { id: loserId }, data: { status: RecordStatus.MERGED, mergedIntoId: survivorId } });

        // Merge candidates: the pair itself is MERGED; others of the loser are re-paired (DISTINCT wins on collision).
        if (pair) await tx.mergeCandidate.update({ where: { id: pair.id }, data: { status: MergeCandidateStatus.MERGED, decidedByUserId: actor.userId ?? null, decidedAt: new Date() } });
        for (const candidate of await tx.mergeCandidate.findMany({ where: { OR: [{ landlordAId: loserId }, { landlordBId: loserId }], NOT: pair ? { id: pair.id } : undefined } })) {
          const other = candidate.landlordAId === loserId ? candidate.landlordBId : candidate.landlordAId;
          if (other === survivorId) {
            await tx.mergeCandidate.delete({ where: { id: candidate.id } });
            continue;
          }
          const [x, y] = orderedPair(survivorId, other);
          const existing = await tx.mergeCandidate.findUnique({ where: { landlordAId_landlordBId: { landlordAId: x, landlordBId: y } } });
          if (existing) {
            if (candidate.status === MergeCandidateStatus.DISTINCT && existing.status !== MergeCandidateStatus.DISTINCT)
              await tx.mergeCandidate.update({ where: { id: existing.id }, data: { status: MergeCandidateStatus.DISTINCT } });
            await tx.mergeCandidate.delete({ where: { id: candidate.id } });
          } else {
            await tx.mergeCandidate.update({ where: { id: candidate.id }, data: { landlordAId: x, landlordBId: y } });
          }
        }

        const merge = await tx.landlordMerge.create({
          data: { survivorId, loserId, actorUserId: actor.userId ?? null, snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue },
        });
        for (const id of [survivorId, loserId])
          await tx.changeLog.create({
            data: { landlordId: id, action: "MERGED", summary: id === loserId ? `Zusammengeführt in ${survivorId}` : `${loserId} übernommen`, actorUserId: actor.userId ?? null },
          });
        return { mergeId: merge.id };
      },
      { timeout: 60_000, maxWait: 30_000 },
    );
  }

  async unmerge(mergeId: string, actor: MergeActor): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IDENTITY_LOCK})`;
        const merge = await tx.landlordMerge.findUnique({ where: { id: mergeId } });
        if (!merge || merge.undoneAt) throw new BadRequestException("Diese Zusammenführung kann nicht rückgängig gemacht werden.");
        const loser = await tx.landlord.findUnique({ where: { id: merge.loserId } });
        const survivor = await tx.landlord.findUnique({ where: { id: merge.survivorId } });
        if (!loser || loser.status !== RecordStatus.MERGED || loser.mergedIntoId !== merge.survivorId || !survivor || survivor.status === RecordStatus.MERGED)
          throw new BadRequestException("Der Zustand hat sich seit der Zusammenführung geändert; bitte manuell prüfen.");
        const snapshot = merge.snapshot as unknown as Snapshot;
        const back = { landlordId: merge.loserId };
        const moved = snapshot.moved ?? {};
        const ids = (table: string) => moved[table] ?? [];
        await tx.landlordAlias.updateMany({ where: { id: { in: ids("LandlordAlias") } }, data: back });
        await tx.landlordIdentifier.updateMany({ where: { id: { in: ids("LandlordIdentifier") } }, data: back });
        await tx.landlordLocation.updateMany({ where: { id: { in: ids("LandlordLocation") } }, data: back });
        await tx.sourceRecord.updateMany({ where: { id: { in: ids("SourceRecord") } }, data: back });
        await tx.externalReference.updateMany({ where: { id: { in: ids("ExternalReference") } }, data: back });
        await tx.mappingReport.updateMany({ where: { id: { in: ids("MappingReport") } }, data: back });
        await tx.property.updateMany({ where: { id: { in: ids("Property") } }, data: back });
        await tx.propertyParty.updateMany({ where: { id: { in: ids("PropertyParty") } }, data: back });
        await tx.user.updateMany({ where: { id: { in: ids("User") } }, data: back });
        await tx.listing.updateMany({ where: { id: { in: ids("Listing") } }, data: back });
        await tx.review.updateMany({ where: { id: { in: ids("Review") } }, data: { targetId: merge.loserId } });
        await tx.landlord.updateMany({ where: { id: { in: ids("Landlord.mergedInto") } }, data: { mergedIntoId: merge.loserId } });
        for (const relationId of ids("CompanyRelation")) {
          const relation = await tx.companyRelation.findUnique({ where: { id: relationId } });
          if (!relation) continue;
          await tx.companyRelation.update({
            where: { id: relationId },
            data: relation.fromLandlordId === merge.survivorId ? { fromLandlordId: merge.loserId } : { toLandlordId: merge.loserId },
          });
        }
        await tx.landlordAlias.deleteMany({ where: { id: { in: snapshot.addedAliasIds ?? [] } } });
        if (Object.keys(snapshot.survivorBefore ?? {}).length)
          await tx.landlord.update({ where: { id: merge.survivorId }, data: snapshot.survivorBefore as Prisma.LandlordUpdateInput });
        const loserBefore = snapshot.loser as { status: RecordStatus };
        await tx.landlord.update({ where: { id: merge.loserId }, data: { status: loserBefore.status, mergedIntoId: null } });
        const [a, b] = orderedPair(merge.survivorId, merge.loserId);
        await tx.mergeCandidate.updateMany({ where: { landlordAId: a, landlordBId: b }, data: { status: MergeCandidateStatus.PENDING, decidedAt: null, decidedByUserId: null } });
        await tx.landlordMerge.update({ where: { id: mergeId }, data: { undoneAt: new Date(), undoneByUserId: actor.userId ?? null } });
        for (const id of [merge.survivorId, merge.loserId])
          await tx.changeLog.create({ data: { landlordId: id, action: "UNMERGED", actorUserId: actor.userId ?? null } });
      },
      { timeout: 60_000, maxWait: 30_000 },
    );
  }

  /** The pair is two different legal entities; a remaining CANDIDATE side without further doubts becomes public. */
  async markDistinct(candidateId: string, actor: MergeActor): Promise<void> {
    const candidate = await this.prisma.mergeCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException("Kandidat nicht gefunden.");
    await this.prisma.mergeCandidate.update({
      where: { id: candidateId },
      data: { status: MergeCandidateStatus.DISTINCT, decidedByUserId: actor.userId ?? null, decidedAt: new Date() },
    });
    for (const id of [candidate.landlordAId, candidate.landlordBId]) {
      const landlord = await this.prisma.landlord.findUnique({ where: { id } });
      if (!landlord || landlord.status !== RecordStatus.CANDIDATE || landlord.relevance !== "CONFIRMED") continue;
      const open = await this.prisma.mergeCandidate.count({
        where: { status: MergeCandidateStatus.PENDING, OR: [{ landlordAId: id }, { landlordBId: id }] },
      });
      if (!open) await this.prisma.landlord.update({ where: { id }, data: { status: RecordStatus.ACTIVE } });
    }
  }
}
