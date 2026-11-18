import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import {
  AliasType,
  CompanyKind,
  IdentifierScheme,
  Landlord,
  LandlordRelevance,
  LocationType,
  MergeCandidateStatus,
  OperationalStatus,
  Prisma,
  RecordStatus,
  VerificationStatus,
} from "@prisma/client";
import { toGermanStateCode } from "../../common/geo/german-states";
import { keyedHash } from "../../common/privacy/keyed-hash";
import { SOURCE_PRIORITY_LEGACY, SOURCE_PRIORITY_MANUAL, getSourceEntry } from "../../common/sources/source-catalog";
import { JobQueueService } from "../jobs/job.types";
import { linkLandlordDedupeKey, EXTERNAL_JOBS } from "../external/external.types";
import { PrismaService } from "../prisma/prisma.service";
import { companyKindLabel } from "./company-kind";
import {
  COLLECTABLE_LEGAL_FORMS,
  CompanyPointer,
  CompanyResolverService,
  DiscoveredCompany,
  DiscoveredIdentifier,
  LandlordNameSearchService,
  LegalFormCode,
  ResolutionContext,
  ResolutionResult,
} from "./company.types";
import { MatchSubject, scoreCompanyMatch } from "./matching";
import {
  NORMALIZATION_VERSION,
  addressKey,
  canonicalIdentifier,
  classifyByName,
  normalizeCompanyName,
  orderedPair,
  registrableDomain,
  safeHttpUrl,
  slugifyCompany,
} from "./normalization";

type Tx = Prisma.TransactionClient;
type CanonicalId = { scheme: IdentifierScheme; value: string };
type FieldSources = Record<string, { source: string; at: string }>;

/** All identity writes are serialised with this advisory lock (spec section 3.3). */
const IDENTITY_LOCK = 727001;
const NOT_COLLECTABLE: LegalFormCode[] = ["GBR", "EK", "PARTG"];
const RELEVANCE_ORDER: LandlordRelevance[] = [
  LandlordRelevance.UNKNOWN,
  LandlordRelevance.LIKELY,
  LandlordRelevance.CONFIRMED,
];
const PRIMARY_ID_ORDER: IdentifierScheme[] = [
  IdentifierScheme.LEI,
  IdentifierScheme.GERMAN_REGISTER,
  IdentifierScheme.WIKIDATA,
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** JSON with sorted keys, so equal content always hashes equally. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function relevanceOf(value: "confirmed" | "likely" | "unknown"): LandlordRelevance {
  return value === "confirmed"
    ? LandlordRelevance.CONFIRMED
    : value === "likely"
      ? LandlordRelevance.LIKELY
      : LandlordRelevance.UNKNOWN;
}

function maxRelevance(a: LandlordRelevance, b: LandlordRelevance): LandlordRelevance {
  return RELEVANCE_ORDER.indexOf(a) >= RELEVANCE_ORDER.indexOf(b) ? a : b;
}

function priorityOf(source: string | undefined): number {
  if (!source || source === "legacy") return SOURCE_PRIORITY_LEGACY;
  if (source === "manual") return SOURCE_PRIORITY_MANUAL;
  return getSourceEntry(source)?.priority ?? SOURCE_PRIORITY_LEGACY;
}

/** A cuid-like id generated before the insert, so the slug can contain it (no "try and retry"). */
function newId(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

/**
 * Turns one record of an external source into a landlord: update a known one, create a new one, or park it
 * as CANDIDATE with a MergeCandidate when the identity is uncertain (docs/vermieter-verzeichnis.md 3.3).
 * Idempotent: the same record twice yields "unchanged" the second time.
 */
@Injectable()
export class CompanyResolverServiceImpl implements CompanyResolverService {
  private readonly logger = new Logger("CompanyResolver");

  constructor(
    private readonly prisma: PrismaService,
    private readonly nameSearch: LandlordNameSearchService,
    private readonly jobs: JobQueueService,
  ) {}

  async upsertFromSource(record: DiscoveredCompany, ctx: ResolutionContext = {}): Promise<ResolutionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IDENTITY_LOCK})`;
        const result = await this.resolve(tx, record, ctx);
        if (result.landlordId && ["created", "updated", "candidate_created"].includes(result.outcome)) {
          await this.jobs.enqueue(
            {
              type: EXTERNAL_JOBS.LINK_LANDLORD,
              payload: { landlordId: result.landlordId },
              dedupeKey: linkLandlordDedupeKey(result.landlordId),
              rerunIfRunning: true,
            },
            tx,
          );
        }
        return result;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
  }

  async markUnseenSourceRecords(sourceKey: string, runStartedAt: Date, externalIdPrefix?: string): Promise<number> {
    const result = await this.prisma.sourceRecord.updateMany({
      where: {
        sourceKey,
        lastSeenAt: { lt: runStartedAt },
        removedAt: null,
        ...(externalIdPrefix ? { externalId: { startsWith: externalIdPrefix } } : {}),
      },
      data: { removedAt: new Date() },
    });
    return result.count;
  }

  // -------------------------------------------------------------------------------------------
  // Resolution steps
  // -------------------------------------------------------------------------------------------

  private async resolve(tx: Tx, r: DiscoveredCompany, ctx: ResolutionContext): Promise<ResolutionResult> {
    const skipped = (reason: string): ResolutionResult => ({
      outcome: "skipped",
      mergeCandidateIds: [],
      conflicts: [],
      unresolvedRelations: 0,
      reason,
    });

    // 1. Discard.
    if (r.headquarters?.country && r.headquarters.country.toUpperCase() !== "DE") return skipped("skipped:not_germany");
    const primary = normalizeCompanyName(r.name);
    const legal = r.legalName ? normalizeCompanyName(r.legalName) : null;
    const legalForm: LegalFormCode | null = r.legalForm ?? legal?.legalForm ?? primary.legalForm;
    if (legalForm && NOT_COLLECTABLE.includes(legalForm)) return skipped("skipped:not_legal_entity");
    if (r.entityNature !== "legal_entity" && !(legalForm && COLLECTABLE_LEGAL_FORMS.includes(legalForm)))
      return skipped("skipped:not_legal_entity");
    if (!primary.normalized && !legal?.normalized) return skipped("skipped:empty_name");

    const identifiers = this.canonicalIds(r.identifiers ?? []);
    if (await this.isSuppressed(tx, r, identifiers, (legal ?? primary).normalized)) return skipped("skipped:suppressed");

    // 2. Collect every landlord the record's own ids point to.
    const sourceRecord = await tx.sourceRecord.findUnique({
      where: { sourceKey_externalId: { sourceKey: r.sourceKey, externalId: r.externalId } },
    });
    const byId = new Map<string, { landlord: Landlord; via: string }>();
    if (sourceRecord) {
      const landlord = await this.followMerged(tx, sourceRecord.landlordId);
      if (landlord) byId.set(landlord.id, { landlord, via: "source" });
    }
    const idRows = identifiers.length
      ? await tx.landlordIdentifier.findMany({
          where: { OR: identifiers.map((id) => ({ scheme: id.scheme, value: id.value })) },
        })
      : [];
    for (const row of idRows) {
      const landlord = await this.followMerged(tx, row.landlordId);
      if (landlord && !byId.has(landlord.id)) byId.set(landlord.id, { landlord, via: `identifier:${row.scheme}` });
    }

    const conflicts: ResolutionResult["conflicts"] = [];
    const mergeCandidateIds: string[] = [];
    let target: Landlord | null = null;
    let reason = "new";

    if (byId.size === 1) {
      const [{ landlord, via }] = [...byId.values()];
      target = landlord;
      reason = `matched:${via}`;
      if (via === "source" && idRows.length === 0) {
        // The source id alone: make sure it still describes the same company.
        const check = scoreCompanyMatch(this.subjectOfRecord(r, identifiers), await this.subjectOfLandlord(tx, landlord));
        if (check.decision === "different") {
          await this.detachSource(tx, sourceRecord!.id, landlord.id, r.sourceKey);
          target = null;
          reason = "new:source_detached";
        }
      }
    } else if (byId.size > 1) {
      // Several different landlords: never re-point anything. Primary id of the source wins.
      const preferred =
        [...byId.values()].find((hit) => hit.via === "source") ??
        PRIMARY_ID_ORDER.map((scheme) => [...byId.values()].find((hit) => hit.via === `identifier:${scheme}`)).find(
          Boolean,
        )!;
      target = preferred.landlord;
      reason = `matched:${preferred.via}`;
      for (const hit of byId.values()) {
        if (hit.landlord.id === target.id) continue;
        mergeCandidateIds.push(
          await this.upsertMergeCandidate(tx, target.id, hit.landlord.id, 1, ["identifier_conflict"]),
        );
      }
      for (const row of idRows) {
        const owner = await this.followMerged(tx, row.landlordId);
        if (owner && owner.id !== target.id)
          conflicts.push({ scheme: row.scheme, value: row.value, otherLandlordId: owner.id });
      }
      await this.log(tx, target.id, "IDENTIFIER_CONFLICT", "Kennungen der Quelle gehören zu mehreren Datensätzen.", r, ctx);
    }

    if (target && (target.status === RecordStatus.REJECTED || target.status === RecordStatus.REMOVED)) {
      if (sourceRecord) await tx.sourceRecord.update({ where: { id: sourceRecord.id }, data: { lastSeenAt: new Date() } });
      return { ...skipped("skipped:rejected"), landlordId: target.id, landlordStatus: target.status };
    }

    // 3. A site of a known company.
    if (!target && r.recordKind === "location" && r.locationOf) {
      const owner = await this.resolvePointer(tx, r.locationOf);
      if (owner && (r.locationOf.via === "operator" || primary.normalized === owner.normalizedName)) {
        const sr = await this.upsertSourceRecord(tx, owner.id, r);
        await this.upsertLocations(tx, owner.id, r, sr.id, LocationType.BRANCH);
        return {
          outcome: "location_attached",
          landlordId: owner.id,
          landlordStatus: owner.status,
          mergeCandidateIds: [],
          conflicts: [],
          unresolvedRelations: 0,
          reason: "location_of",
        };
      }
    }

    // 4. No target by id: compare with similar records.
    let newStatus: RecordStatus = RecordStatus.ACTIVE;
    if (!target) {
      const subject = this.subjectOfRecord(r, identifiers);
      const candidates = await this.similarLandlords(tx, r, subject);
      const same: Landlord[] = [];
      const maybe: Array<{ landlord: Landlord; score: number; reasons: string[] }> = [];
      for (const candidate of candidates) {
        const result = scoreCompanyMatch(subject, await this.subjectOfLandlord(tx, candidate));
        if (result.decision === "same") same.push(candidate);
        else if (result.decision === "candidate") maybe.push({ landlord: candidate, score: result.score, reasons: result.reasons });
      }
      if (same.length === 1) {
        target = same[0];
        reason = "matched:name";
        if (target.status === RecordStatus.REJECTED) {
          await this.upsertSourceRecord(tx, target.id, r);
          return { ...skipped("skipped:rejected"), landlordId: target.id, landlordStatus: target.status };
        }
      } else {
        const relevance = this.relevanceOfRecord(r, primary, legal);
        const official = identifiers.some(
          (id) => id.scheme === IdentifierScheme.LEI || id.scheme === IdentifierScheme.GERMAN_REGISTER,
        );
        if (r.entityStatus === "inactive") return skipped("skipped:inactive_unknown");
        newStatus = relevance === LandlordRelevance.CONFIRMED ? RecordStatus.ACTIVE : RecordStatus.CANDIDATE;
        if (ctx.trigger === "search_on_miss" && !official && getSourceEntry(r.sourceKey)?.publiclyEditable !== false)
          newStatus = RecordStatus.CANDIDATE;
        if (r.sourceKey === "osm" && process.env.OSM_AUTO_PUBLISH !== "true") newStatus = RecordStatus.CANDIDATE;
        reason = "new";
        if (same.length > 1) {
          newStatus = RecordStatus.CANDIDATE;
          reason = "candidate:several_same";
        } else if (maybe.length) {
          const relevanceOk = relevance === LandlordRelevance.CONFIRMED;
          if (!(official && relevanceOk)) newStatus = RecordStatus.CANDIDATE;
          reason = newStatus === RecordStatus.CANDIDATE ? "candidate:similar_name" : "new:similar_name_review";
        } else if (newStatus === RecordStatus.CANDIDATE) {
          reason = "candidate:relevance";
        }
        target = await this.createLandlord(tx, r, primary, legal, legalForm, relevance, newStatus, ctx);
        const pairs = same.length > 1 ? same.map((l) => ({ landlord: l, score: 1, reasons: ["several_same"] })) : maybe;
        const existing = await tx.mergeCandidate.findMany({
          where: {
            status: MergeCandidateStatus.DISTINCT,
            OR: pairs.map((p) => {
              const [a, b] = orderedPair(target!.id, p.landlord.id);
              return { landlordAId: a, landlordBId: b };
            }),
          },
        });
        const distinct = new Set(existing.map((m) => `${m.landlordAId}|${m.landlordBId}`));
        for (const pair of pairs.sort((x, y) => y.score - x.score).slice(0, 5)) {
          const [a, b] = orderedPair(target.id, pair.landlord.id);
          if (distinct.has(`${a}|${b}`)) continue;
          mergeCandidateIds.push(await this.upsertMergeCandidate(tx, target.id, pair.landlord.id, pair.score, pair.reasons));
        }
      }
    }

    // 5.-9. Fields, child rows, relations, provenance, verification.
    const created = reason.startsWith("new") || reason.startsWith("candidate");
    const sr = await this.upsertSourceRecord(tx, target.id, r);
    const changed = await this.applyFields(tx, target, r, primary, legal, legalForm, ctx);
    const childChanges = await this.applyChildren(tx, target.id, r, sr.id, identifiers, conflicts);
    const unresolvedRelations = await this.applyRelations(tx, target.id, r, sr.id);
    await this.materializePending(tx, target.id);
    await this.refreshVerification(tx, target.id);

    const after = await tx.landlord.findUniqueOrThrow({ where: { id: target.id } });
    const outcome: ResolutionResult["outcome"] = created
      ? after.status === RecordStatus.ACTIVE
        ? "created"
        : "candidate_created"
      : changed || childChanges || sr.changed
        ? "updated"
        : "unchanged";
    return {
      outcome,
      landlordId: after.id,
      landlordStatus: after.status,
      mergeCandidateIds,
      conflicts,
      unresolvedRelations,
      reason,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------------------------

  private canonicalIds(ids: DiscoveredIdentifier[]): CanonicalId[] {
    const result: CanonicalId[] = [];
    for (const id of ids) {
      const canonical = canonicalIdentifier(id);
      if (canonical && !result.some((r) => r.scheme === canonical.scheme && r.value === canonical.value))
        result.push(canonical);
    }
    return result;
  }

  private async isSuppressed(tx: Tx, r: DiscoveredCompany, ids: CanonicalId[], normalized: string): Promise<boolean> {
    const keys = [
      { keyType: "source", keyValue: `${r.sourceKey}:${r.externalId}` },
      ...ids.map((id) => ({ keyType: "identifier", keyValue: `${id.scheme}:${id.value}` })),
    ];
    if (normalized) {
      try {
        keys.push({
          keyType: "name",
          keyValue: keyedHash("suppression-name", `${normalized}|${r.headquarters?.postalCode ?? ""}`),
        });
      } catch {
        // Without a hash secret no name suppression can exist either.
      }
    }
    const hit = await tx.discoverySuppression.findFirst({ where: { OR: keys } });
    return Boolean(hit);
  }

  private async followMerged(tx: Tx, id: string): Promise<Landlord | null> {
    let current = await tx.landlord.findUnique({ where: { id } });
    for (let hop = 0; current && current.status === RecordStatus.MERGED && current.mergedIntoId && hop < 5; hop++)
      current = await tx.landlord.findUnique({ where: { id: current.mergedIntoId } });
    return current;
  }

  private async resolvePointer(
    tx: Tx,
    pointer: CompanyPointer,
  ): Promise<Landlord | null> {
    if (pointer.identifier) {
      const id = canonicalIdentifier(pointer.identifier);
      if (id) {
        const row = await tx.landlordIdentifier.findUnique({ where: { scheme_value: id } });
        if (row) return this.followMerged(tx, row.landlordId);
      }
    }
    if (pointer.sourceRef) {
      const row = await tx.sourceRecord.findUnique({
        where: { sourceKey_externalId: { sourceKey: pointer.sourceRef.sourceKey, externalId: pointer.sourceRef.externalId } },
      });
      if (row) return this.followMerged(tx, row.landlordId);
    }
    return null;
  }

  private subjectOfRecord(r: DiscoveredCompany, identifiers: CanonicalId[]): MatchSubject {
    const names: MatchSubject["names"] = [];
    const add = (raw: string | undefined, kind: "primary" | "legal" | "alias") => {
      if (!raw) return;
      const n = normalizeCompanyName(raw);
      if (n.normalized) names.push({ normalized: n.normalized, legalForm: n.legalForm ?? (kind !== "alias" ? r.legalForm ?? null : null), kind });
    };
    add(r.name, "primary");
    add(r.legalName, "legal");
    if (r.recordKind === "entity") for (const alias of r.aliases ?? []) add(alias.name, "alias");
    return {
      names,
      identifiers,
      websiteDomain: registrableDomain(r.website),
      postalCode: r.headquarters?.postalCode ?? null,
      city: r.headquarters?.city ?? null,
    };
  }

  private async subjectOfLandlord(tx: Tx, landlord: Landlord): Promise<MatchSubject> {
    const [aliases, identifiers] = await Promise.all([
      tx.landlordAlias.findMany({ where: { landlordId: landlord.id } }),
      tx.landlordIdentifier.findMany({ where: { landlordId: landlord.id } }),
    ]);
    const names: MatchSubject["names"] = [
      { normalized: landlord.normalizedName, legalForm: (landlord.legalForm as LegalFormCode | null) ?? null, kind: "primary" as const },
      ...aliases.map((alias) => ({
        normalized: alias.normalizedName,
        legalForm: (alias.legalForm as LegalFormCode | null) ?? null,
        kind: alias.type === AliasType.LEGAL_NAME ? ("legal" as const) : ("alias" as const),
      })),
    ].filter((n) => n.normalized);
    return {
      names,
      identifiers: identifiers.map((id) => ({ scheme: id.scheme, value: id.value })),
      websiteDomain: landlord.websiteDomain,
      postalCode: landlord.postalCode,
      city: landlord.city,
    };
  }

  /** Exact normalized name (landlord and alias), same domain, then trigram neighbours (top 20). */
  private async similarLandlords(tx: Tx, r: DiscoveredCompany, subject: MatchSubject): Promise<Landlord[]> {
    const statuses = [RecordStatus.ACTIVE, RecordStatus.CANDIDATE, RecordStatus.REJECTED];
    const names = [...new Set(subject.names.map((n) => n.normalized))];
    const ids = new Set<string>();
    if (names.length) {
      const exact = await tx.landlord.findMany({
        where: {
          status: { in: statuses },
          kind: { not: CompanyKind.PRIVATE_LANDLORD },
          OR: [{ normalizedName: { in: names } }, { aliases: { some: { normalizedName: { in: names } } } }],
        },
        select: { id: true },
        take: 50,
      });
      exact.forEach((row) => ids.add(row.id));
    }
    if (subject.websiteDomain) {
      const byDomain = await tx.landlord.findMany({
        where: { status: { in: statuses }, websiteDomain: subject.websiteDomain },
        select: { id: true },
        take: 20,
      });
      byDomain.forEach((row) => ids.add(row.id));
    }
    for (const name of names.slice(0, 2)) {
      const hits = await this.nameSearch.search(name, { statuses, limit: 20, minScore: 0.6 }, tx);
      hits.forEach((hit) => ids.add(hit.landlordId));
    }
    if (!ids.size) return [];
    const rows = await tx.landlord.findMany({
      where: { id: { in: [...ids] }, kind: { not: CompanyKind.PRIVATE_LANDLORD } },
    });
    return rows.slice(0, 40);
  }

  private relevanceOfRecord(
    r: DiscoveredCompany,
    primary: ReturnType<typeof normalizeCompanyName>,
    legal: ReturnType<typeof normalizeCompanyName> | null,
  ): LandlordRelevance {
    let relevance = relevanceOf(r.relevance);
    // Keywords count only in a REGISTERED name.
    if (r.nameIsRegistered) relevance = maxRelevance(relevance, relevanceOf(classifyByName(legal ?? primary).relevance));
    return relevance;
  }

  private kindOfRecord(
    r: DiscoveredCompany,
    primary: ReturnType<typeof normalizeCompanyName>,
    legal: ReturnType<typeof normalizeCompanyName> | null,
  ): CompanyKind | undefined {
    if (r.kind) return r.kind;
    if (r.nameIsRegistered) return classifyByName(legal ?? primary).kind;
    return undefined;
  }

  private async createLandlord(
    tx: Tx,
    r: DiscoveredCompany,
    primary: ReturnType<typeof normalizeCompanyName>,
    legal: ReturnType<typeof normalizeCompanyName> | null,
    legalForm: LegalFormCode | null,
    relevance: LandlordRelevance,
    status: RecordStatus,
    ctx: ResolutionContext,
  ): Promise<Landlord> {
    const id = newId();
    const kind = this.kindOfRecord(r, primary, legal) ?? CompanyKind.UNKNOWN;
    const city = r.headquarters?.city?.trim() || null;
    const landlord = await tx.landlord.create({
      data: {
        id,
        name: r.name.trim(),
        slug: slugifyCompany(r.name, city, id),
        companyType: companyKindLabel(kind),
        kind,
        normalizedName: primary.normalized || legal?.normalized || "",
        normalizationVersion: NORMALIZATION_VERSION,
        legalForm,
        status,
        relevance,
        confidence: 0.3,
      },
    });
    await this.log(tx, id, "CREATED", status === RecordStatus.ACTIVE ? "Aus offener Quelle angelegt." : "Als Kandidat angelegt.", r, ctx);
    return landlord;
  }

  /** Step 5: field updates by source priority; manual values are never overwritten. */
  private async applyFields(
    tx: Tx,
    landlord: Landlord,
    r: DiscoveredCompany,
    primary: ReturnType<typeof normalizeCompanyName>,
    legal: ReturnType<typeof normalizeCompanyName> | null,
    legalForm: LegalFormCode | null,
    ctx: ResolutionContext,
  ): Promise<boolean> {
    const sources = { ...((landlord.fieldSources ?? {}) as FieldSources) };
    const priority = priorityOf(r.sourceKey);
    const manuallyVerified = landlord.verificationStatus === VerificationStatus.MANUALLY_VERIFIED;
    const now = new Date().toISOString();
    const data: Prisma.LandlordUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    const write = (field: keyof Landlord & string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      const current = landlord[field] as unknown;
      if (current === value) {
        if (current !== null && !sources[field]) sources[field] = { source: r.sourceKey, at: now };
        return;
      }
      const owner = sources[field]?.source;
      const empty = current === null || current === "" || (field === "kind" && current === CompanyKind.UNKNOWN);
      if (!empty) {
        if (manuallyVerified || owner === "manual") return;
        if (owner !== r.sourceKey && priorityOf(owner) > priority) return;
      }
      (data as Record<string, unknown>)[field] = value;
      changes[field] = { from: current, to: value };
      sources[field] = { source: r.sourceKey, at: now };
    };

    const kind = this.kindOfRecord(r, primary, legal);
    const website = safeHttpUrl(r.website);
    const state = toGermanStateCode(r.headquarters?.state);
    write("name", r.name.trim());
    write("legalName", r.legalName?.trim());
    write("legalForm", legalForm);
    write("city", r.headquarters?.city?.trim());
    write("postalCode", r.headquarters?.postalCode?.trim());
    write("state", state);
    write("website", website);
    write("kind", kind);
    if (r.entityStatus)
      write("operationalStatus", r.entityStatus === "inactive" ? OperationalStatus.DISSOLVED : OperationalStatus.OPERATING);

    if (data.name) {
      const renamed = normalizeCompanyName(String(data.name));
      data.normalizedName = renamed.normalized;
      data.normalizationVersion = NORMALIZATION_VERSION;
      // A replaced display name stays findable as alias.
      if (landlord.name && landlord.name !== data.name)
        await this.addAlias(tx, landlord.id, landlord.name, AliasType.FORMER_NAME, r.sourceKey, null, landlord.normalizedName);
    }
    if (data.website !== undefined) data.websiteDomain = registrableDomain(String(data.website));
    if (data.kind) data.companyType = companyKindLabel(data.kind as CompanyKind);

    const relevance = maxRelevance(landlord.relevance, this.relevanceOfRecord(r, primary, legal));
    if (relevance !== landlord.relevance) {
      data.relevance = relevance;
      changes.relevance = { from: landlord.relevance, to: relevance };
    }
    const changed = Object.keys(changes).length > 0;
    await tx.landlord.update({
      where: { id: landlord.id },
      data: { ...data, fieldSources: sources as Prisma.InputJsonValue, lastRefreshedAt: new Date() },
    });
    if (changed && landlord.createdAt.getTime() < Date.now() - 1000)
      await this.log(tx, landlord.id, "UPDATED", null, r, ctx, changes);
    return changed;
  }

  private async addAlias(
    tx: Tx,
    landlordId: string,
    name: string,
    type: AliasType,
    source: string,
    sourceRecordId: string | null,
    ownNormalized: string,
    ownLegalForm?: string | null,
  ): Promise<boolean> {
    const n = normalizeCompanyName(name);
    // Invariant: an alias never repeats the landlord's own core name with the same legal form.
    if (!n.normalized || (n.normalized === ownNormalized && (n.legalForm ?? null) === (ownLegalForm ?? null))) return false;
    const existing = await tx.landlordAlias.findUnique({ where: { landlordId_name: { landlordId, name } } });
    if (existing) {
      if (sourceRecordId && !existing.sourceRecordId)
        await tx.landlordAlias.update({ where: { id: existing.id }, data: { sourceRecordId } });
      return false;
    }
    await tx.landlordAlias.create({
      data: { landlordId, name, normalizedName: n.normalized, legalForm: n.legalForm, type, source, sourceRecordId },
    });
    return true;
  }

  /** Step 6: aliases, identifiers and locations of this source record. */
  private async applyChildren(
    tx: Tx,
    landlordId: string,
    r: DiscoveredCompany,
    sourceRecordId: string,
    identifiers: CanonicalId[],
    conflicts: ResolutionResult["conflicts"],
  ): Promise<boolean> {
    const landlord = await tx.landlord.findUniqueOrThrow({ where: { id: landlordId } });
    let changed = false;
    const wanted: Array<{ name: string; type: AliasType }> = [];
    if (r.legalName && r.legalName.trim() !== landlord.name) wanted.push({ name: r.legalName.trim(), type: AliasType.LEGAL_NAME });
    if (r.name.trim() !== landlord.name) wanted.push({ name: r.name.trim(), type: AliasType.SPELLING });
    if (r.recordKind === "entity")
      for (const alias of r.aliases ?? []) if (alias.name?.trim()) wanted.push({ name: alias.name.trim(), type: alias.type ?? AliasType.SPELLING });
    for (const alias of wanted.slice(0, 30))
      changed =
        (await this.addAlias(tx, landlordId, alias.name, alias.type, r.sourceKey, sourceRecordId, landlord.normalizedName, landlord.legalForm)) ||
        changed;
    // Aliases this source no longer states are removed (only those it created itself).
    const stale = await tx.landlordAlias.deleteMany({
      where: { sourceRecordId, name: { notIn: wanted.map((a) => a.name) } },
    });
    if (stale.count) changed = true;

    const hasLei = await tx.landlordIdentifier.findFirst({ where: { landlordId, scheme: IdentifierScheme.LEI } });
    for (const id of identifiers) {
      if (conflicts.some((c) => c.scheme === id.scheme && c.value === id.value)) continue;
      const existing = await tx.landlordIdentifier.findUnique({ where: { scheme_value: id } });
      if (existing) continue; // never re-pointed outside a merge
      if (id.scheme === IdentifierScheme.LEI && hasLei && hasLei.value !== id.value) continue; // at most one LEI
      await tx.landlordIdentifier.create({ data: { landlordId, scheme: id.scheme, value: id.value, source: r.sourceKey, sourceRecordId } });
      changed = true;
    }

    if (await this.upsertLocations(tx, landlordId, r, sourceRecordId, LocationType.HEADQUARTERS)) changed = true;
    return changed;
  }

  private async upsertLocations(
    tx: Tx,
    landlordId: string,
    r: DiscoveredCompany,
    sourceRecordId: string,
    hqType: LocationType,
  ): Promise<boolean> {
    const entries: Array<{ type: LocationType; ref: string; a: NonNullable<DiscoveredCompany["headquarters"]>; name?: string }> = [];
    if (r.headquarters && (r.headquarters.postalCode || r.headquarters.street))
      entries.push({ type: hqType, ref: `${r.externalId}#hq`, a: r.headquarters });
    for (const location of r.locations ?? []) {
      if (!location.postalCode && !location.street) continue;
      const key = addressKey(location) ?? "";
      entries.push({ type: LocationType.BRANCH, ref: location.externalRef ?? `${r.externalId}#${sha256(key).slice(0, 12)}`, a: location, name: location.name });
    }
    let changed = false;
    const priority = priorityOf(r.sourceKey);
    for (const entry of entries) {
      let type = entry.type;
      if (type === LocationType.HEADQUARTERS) {
        const otherHq = await tx.landlordLocation.findFirst({
          where: { landlordId, type: LocationType.HEADQUARTERS, NOT: { source: r.sourceKey } },
        });
        if (otherHq && priorityOf(otherHq.source) > priority) type = LocationType.BRANCH;
        else if (otherHq) await tx.landlordLocation.update({ where: { id: otherHq.id }, data: { type: LocationType.BRANCH } });
      }
      const data = {
        landlordId,
        type,
        name: entry.name ?? null,
        street: entry.a.street ?? null,
        houseNumber: entry.a.houseNumber ?? null,
        postalCode: entry.a.postalCode ?? null,
        city: entry.a.city ?? null,
        state: toGermanStateCode(entry.a.state) ?? null,
        latitude: entry.a.latitude ?? null,
        longitude: entry.a.longitude ?? null,
        addressKey: addressKey(entry.a),
        sourceRecordId,
      };
      const existing = await tx.landlordLocation.findUnique({
        where: { source_externalRef: { source: r.sourceKey, externalRef: entry.ref } },
      });
      if (!existing) {
        await tx.landlordLocation.create({ data: { ...data, source: r.sourceKey, externalRef: entry.ref } });
        changed = true;
      } else if (
        existing.addressKey !== data.addressKey ||
        existing.type !== data.type ||
        existing.city !== data.city ||
        existing.landlordId !== landlordId
      ) {
        await tx.landlordLocation.update({ where: { id: existing.id }, data });
        changed = true;
      }
    }
    if (changed) {
      const states = await tx.landlordLocation.findMany({ where: { landlordId, state: { not: null } }, select: { state: true } });
      await tx.landlord.update({
        where: { id: landlordId },
        data: { operatingStates: [...new Set(states.map((s) => s.state!))].sort() },
      });
    }
    return changed;
  }

  /** Step 7: relations to other companies, or pending until the other side is known. */
  private async applyRelations(tx: Tx, landlordId: string, r: DiscoveredCompany, sourceRecordId: string): Promise<number> {
    await tx.pendingRelation.deleteMany({ where: { sourceRecordId } });
    let unresolved = 0;
    for (const relation of r.relations ?? []) {
      const other = await this.resolvePointer(tx, relation.other);
      if (other && other.id === landlordId) continue;
      if (other) {
        const [from, to] = relation.direction === "outgoing" ? [landlordId, other.id] : [other.id, landlordId];
        await tx.companyRelation.upsert({
          where: { fromLandlordId_toLandlordId_type: { fromLandlordId: from, toLandlordId: to, type: relation.type } },
          create: { fromLandlordId: from, toLandlordId: to, type: relation.type, source: r.sourceKey, sourceRecordId },
          update: {},
        });
        continue;
      }
      const id = relation.other.identifier ? canonicalIdentifier(relation.other.identifier) : null;
      if (!id && !relation.other.sourceRef) continue;
      await tx.pendingRelation.create({
        data: {
          sourceRecordId,
          type: relation.type,
          direction: relation.direction,
          otherScheme: id?.scheme ?? null,
          otherValue: id?.value ?? null,
          otherSourceKey: relation.other.sourceRef?.sourceKey ?? null,
          otherExternalId: relation.other.sourceRef?.externalId ?? null,
        },
      });
      unresolved++;
    }
    return unresolved;
  }

  /** Pending relations of OTHER records that point to this landlord become real relations. */
  private async materializePending(tx: Tx, landlordId: string): Promise<void> {
    const [ids, records] = await Promise.all([
      tx.landlordIdentifier.findMany({ where: { landlordId } }),
      tx.sourceRecord.findMany({ where: { landlordId }, select: { sourceKey: true, externalId: true } }),
    ]);
    const or: Prisma.PendingRelationWhereInput[] = [
      ...ids.map((id) => ({ otherScheme: id.scheme, otherValue: id.value })),
      ...records.map((rec) => ({ otherSourceKey: rec.sourceKey, otherExternalId: rec.externalId })),
    ];
    if (!or.length) return;
    const pending = await tx.pendingRelation.findMany({ where: { OR: or }, include: { sourceRecord: true } });
    for (const p of pending) {
      const owner = p.sourceRecord.landlordId;
      if (owner === landlordId) {
        await tx.pendingRelation.delete({ where: { id: p.id } });
        continue;
      }
      const [from, to] = p.direction === "outgoing" ? [owner, landlordId] : [landlordId, owner];
      await tx.companyRelation.upsert({
        where: { fromLandlordId_toLandlordId_type: { fromLandlordId: from, toLandlordId: to, type: p.type } },
        create: { fromLandlordId: from, toLandlordId: to, type: p.type, source: p.sourceRecord.sourceKey, sourceRecordId: p.sourceRecordId },
        update: {},
      });
      await tx.pendingRelation.delete({ where: { id: p.id } });
    }
  }

  /** Step 8: provenance with content hash; unchanged content only bumps lastSeenAt. */
  private async upsertSourceRecord(tx: Tx, landlordId: string, r: DiscoveredCompany): Promise<{ id: string; changed: boolean }> {
    const { fetchedAt: _fetchedAt, ...payload } = r;
    void _fetchedAt;
    const contentHash = sha256(stableJson(payload));
    const now = new Date();
    const existing = await tx.sourceRecord.findUnique({
      where: { sourceKey_externalId: { sourceKey: r.sourceKey, externalId: r.externalId } },
    });
    if (!existing) {
      const created = await tx.sourceRecord.create({
        data: {
          landlordId,
          sourceKey: r.sourceKey,
          externalId: r.externalId,
          url: r.sourceUrl ?? null,
          license: r.license,
          payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
          contentHash,
        },
      });
      return { id: created.id, changed: true };
    }
    const changed = existing.contentHash !== contentHash || existing.landlordId !== landlordId;
    await tx.sourceRecord.update({
      where: { id: existing.id },
      data: {
        landlordId,
        lastSeenAt: now,
        removedAt: null,
        ...(changed
          ? { payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue, contentHash, lastChangedAt: now, url: r.sourceUrl ?? null }
          : {}),
      },
    });
    return { id: existing.id, changed };
  }

  private async detachSource(tx: Tx, sourceRecordId: string, landlordId: string, sourceKey: string): Promise<void> {
    await tx.sourceRecord.delete({ where: { id: sourceRecordId } });
    await tx.changeLog.create({
      data: { landlordId, action: "SOURCE_DETACHED", summary: "Quell-ID beschreibt ein anderes Unternehmen.", sourceKey },
    });
  }

  /** Step 9: verification status and the internal confidence ordinal. */
  private async refreshVerification(tx: Tx, landlordId: string): Promise<void> {
    const landlord = await tx.landlord.findUniqueOrThrow({ where: { id: landlordId } });
    if (landlord.verificationStatus === VerificationStatus.MANUALLY_VERIFIED) {
      if (landlord.confidence !== 1) await tx.landlord.update({ where: { id: landlordId }, data: { confidence: 1 } });
      return;
    }
    const [official, sources] = await Promise.all([
      tx.landlordIdentifier.count({
        where: { landlordId, scheme: { in: [IdentifierScheme.LEI, IdentifierScheme.GERMAN_REGISTER] } },
      }),
      tx.sourceRecord.findMany({ where: { landlordId, removedAt: null }, select: { sourceKey: true }, distinct: ["sourceKey"] }),
    ]);
    const twoSources = sources.length >= 2;
    const status = official > 0 || twoSources ? VerificationStatus.AUTO_VERIFIED : VerificationStatus.UNVERIFIED;
    const confidence = Math.min(1, 0.3 + (official ? 0.4 : 0) + (twoSources ? 0.2 : 0) + (landlord.websiteDomain ? 0.1 : 0));
    if (status !== landlord.verificationStatus || Math.abs(confidence - landlord.confidence) > 1e-9)
      await tx.landlord.update({ where: { id: landlordId }, data: { verificationStatus: status, confidence } });
  }

  private async upsertMergeCandidate(tx: Tx, x: string, y: string, score: number, reasons: string[]): Promise<string> {
    const [landlordAId, landlordBId] = orderedPair(x, y);
    const row = await tx.mergeCandidate.upsert({
      where: { landlordAId_landlordBId: { landlordAId, landlordBId } },
      create: { landlordAId, landlordBId, score, reasons },
      update: { score, reasons },
    });
    return row.id;
  }

  private async log(
    tx: Tx,
    landlordId: string,
    action: string,
    summary: string | null,
    r: DiscoveredCompany,
    ctx: ResolutionContext,
    changes?: Record<string, { from: unknown; to: unknown }>,
  ): Promise<void> {
    await tx.changeLog.create({
      data: {
        landlordId,
        action,
        summary,
        sourceKey: r.sourceKey,
        jobId: ctx.jobId ?? null,
        changes: changes ? (JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
