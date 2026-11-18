import { randomUUID } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DiscoveryQueryStatus, Prisma, RecordStatus } from "@prisma/client";
import { DiscoveryRequestResponse, DiscoveryStatusApi } from "../../common/api/api-types";
import { OutboundHttpError } from "../../common/http/outbound-http.types";
import { keyedHash } from "../../common/privacy/keyed-hash";
import { CompanyResolverService, LandlordNameSearchService, LandlordSummaryService } from "../companies/company.types";
import { looksLikeCompanyQuery, normalizeCompanyName } from "../companies/normalization";
import { scoreCompanyMatch } from "../companies/matching";
import { JobContext, JobContinuation, JobHandlerRegistry, JobQueueService, NonRetryableJobError, RescheduleJobError } from "../jobs/job.types";
import { PrismaService } from "../prisma/prisma.service";
import { DISCOVERY_JOBS, DiscoveryProvider, syncDedupeKey } from "./discovery.types";
import { searchOnMissConfig } from "./discovery.config";
import { GleifLandlordProvider } from "./providers/gleif-landlord.provider";
import { WikidataLandlordProvider } from "./providers/wikidata-landlord.provider";

export interface SyncPayload {
  sourceKey: string;
  scope: string;
  mode?: "FULL";
}

const DAY = 86_400_000;
const RETRY_AFTER: Partial<Record<DiscoveryQueryStatus, number>> = {
  FOUND: DAY,
  NEEDS_REVIEW: 7 * DAY,
  NOT_FOUND: 14 * DAY,
};
const MESSAGES: Record<DiscoveryStatusApi, string> = {
  NOT_NEEDED: "Das Unternehmen ist bereits im Verzeichnis.",
  PENDING: "Die Suche in offenen Quellen wurde gestartet.",
  RUNNING: "Offene Quellen werden durchsucht …",
  FOUND: "In offenen Quellen gefunden und ins Verzeichnis aufgenommen.",
  NEEDS_REVIEW: "Es gab Treffer, die vor der Veröffentlichung geprüft werden.",
  NOT_FOUND: "In Wikidata und GLEIF wurde kein passendes Unternehmen gefunden.",
  FAILED: "Die Quellen waren nicht erreichbar. Bitte versuche es später erneut.",
  UNAVAILABLE: "Die Suche in offenen Quellen ist derzeit nicht verfügbar.",
};

/**
 * Discovery pipeline (docs/vermieter-verzeichnis.md section 5):
 * - discovery.sync-source: one page of one source scope per run, continued via JobContinuation; every record goes
 *   through CompanyResolverService; cursor and watermark live in SourceSyncState.
 * - search-on-miss: a visitor may ask (button, never automatic) to look for a company in Wikidata and GLEIF.
 *   The search text is stored only as a keyed hash plus, while running, the normalized text.
 */
@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly logger = new Logger("Discovery");
  readonly providers: DiscoveryProvider[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobHandlerRegistry,
    private readonly jobs: JobQueueService,
    private readonly resolver: CompanyResolverService,
    private readonly nameSearch: LandlordNameSearchService,
    private readonly summaries: LandlordSummaryService,
    wikidata: WikidataLandlordProvider,
    gleif: GleifLandlordProvider,
  ) {
    this.providers = [wikidata, gleif];
  }

  onModuleInit(): void {
    this.registry.register({
      type: DISCOVERY_JOBS.SYNC_SOURCE,
      timeoutMs: 300_000,
      handle: (payload, ctx) => this.syncPage(payload as SyncPayload, ctx),
    });
    this.registry.register({
      type: DISCOVERY_JOBS.SEARCH_ON_MISS,
      timeoutMs: 120_000,
      handle: (payload, ctx) => this.runSearchOnMiss((payload as { discoveryQueryId: string }).discoveryQueryId, ctx),
    });
    this.registry.register({ type: DISCOVERY_JOBS.PURGE_QUERIES, handle: () => this.purgeQueries() });
    this.registry.registerSchedule({
      key: DISCOVERY_JOBS.PURGE_QUERIES,
      type: DISCOVERY_JOBS.PURGE_QUERIES,
      dedupeKey: DISCOVERY_JOBS.PURGE_QUERIES,
      intervalMinutes: 60,
    });
    for (const provider of this.providers)
      for (const scope of provider.listScopes())
        this.registry.registerSchedule({
          key: syncDedupeKey(provider.key, scope),
          type: DISCOVERY_JOBS.SYNC_SOURCE,
          payload: { sourceKey: provider.key, scope },
          dedupeKey: syncDedupeKey(provider.key, scope),
          intervalMinutes: 7 * 24 * 60,
          network: true,
        });
  }

  provider(key: string): DiscoveryProvider | undefined {
    return this.providers.find((p) => p.key === key);
  }

  // -------------------------------------------------------------------------------------------
  // Bulk sync
  // -------------------------------------------------------------------------------------------

  /** Admin trigger: requests a full sync of every scope (or one) of a source and enqueues the jobs. */
  async requestSync(sourceKey: string, scope?: string, mode?: "FULL"): Promise<{ enqueued: string[] }> {
    const provider = this.provider(sourceKey);
    if (!provider) throw new BadRequestException("Unbekannte Quelle.");
    if (!provider.isEnabled()) throw new BadRequestException(provider.disabledReason() ?? "Quelle ist deaktiviert.");
    const scopes = scope ? [scope] : provider.listScopes();
    if (scope && !provider.listScopes().includes(scope)) throw new BadRequestException("Unbekannter Bereich.");
    const enqueued: string[] = [];
    for (const s of scopes) {
      await this.prisma.sourceSyncState.upsert({
        where: { sourceKey_scope: { sourceKey, scope: s } },
        create: { sourceKey, scope: s, fullSyncRequested: true, mode: "FULL" },
        update: { fullSyncRequested: true, ...(mode === "FULL" ? { mode: "FULL", cursor: Prisma.DbNull, runStartedAt: null } : {}) },
      });
      const { job } = await this.jobs.enqueue({
        type: DISCOVERY_JOBS.SYNC_SOURCE,
        payload: { sourceKey, scope: s, ...(mode ? { mode } : {}) },
        dedupeKey: syncDedupeKey(sourceKey, s),
      });
      enqueued.push(job.id);
    }
    return { enqueued };
  }

  async syncPage(payload: SyncPayload, ctx: JobContext): Promise<unknown> {
    const provider = this.provider(payload?.sourceKey);
    if (!provider || !payload.scope) throw new NonRetryableJobError("Invalid sync payload");
    if (!provider.isEnabled()) return { skipped: "disabled" };
    let state = await this.prisma.sourceSyncState.upsert({
      where: { sourceKey_scope: { sourceKey: provider.key, scope: payload.scope } },
      create: { sourceKey: provider.key, scope: payload.scope },
      update: {},
    });
    // A scheduled run does nothing before an admin started the first full import.
    if (!state.fullSyncRequested) return { skipped: "full_sync_not_requested" };
    if (!state.runStartedAt) {
      state = await this.prisma.sourceSyncState.update({
        where: { id: state.id },
        data: { runStartedAt: new Date(), cursor: Prisma.DbNull, recordsSeen: 0, lastRunAt: new Date() },
      });
    }
    const mode = state.mode === "INCREMENTAL" ? "INCREMENTAL" : "FULL";
    let page;
    try {
      page = await provider.fetchPage(
        {
          scope: payload.scope,
          mode,
          cursor: state.cursor ?? undefined,
          watermark: state.watermark ?? undefined,
          runStartedAt: state.runStartedAt!,
        },
        ctx.signal,
      );
    } catch (error) {
      await this.prisma.sourceSyncState.update({
        where: { id: state.id },
        data: { lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown error" },
      });
      if (error instanceof OutboundHttpError && (error.kind === "rate_limited" || error.kind === "budget"))
        throw new RescheduleJobError("source rate limited", error.retryAt ?? new Date(Date.now() + 3_600_000));
      throw error;
    }

    const counts: Record<string, number> = {};
    for (const record of page.records) {
      if (ctx.signal.aborted) throw new Error("aborted");
      try {
        const result = await this.resolver.upsertFromSource(record, { jobId: ctx.jobId, trigger: "sync" });
        counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
      } catch (error) {
        counts.error = (counts.error ?? 0) + 1;
        ctx.log(`record failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
      }
    }
    const recordsSeen = state.recordsSeen + page.records.length;
    if (!page.done) {
      await this.prisma.sourceSyncState.update({
        where: { id: state.id },
        data: { cursor: page.nextCursor as Prisma.InputJsonValue, recordsSeen, lastError: null },
      });
      return new JobContinuation(new Date(), { ...counts, recordsSeen });
    }
    const runStartedAt = state.runStartedAt!;
    if (mode === "FULL") await this.resolver.markUnseenSourceRecords(provider.key, runStartedAt);
    await this.prisma.sourceSyncState.update({
      where: { id: state.id },
      data: {
        cursor: Prisma.DbNull,
        runStartedAt: null,
        mode: "INCREMENTAL",
        watermark: (page.watermark ?? runStartedAt.toISOString()) as Prisma.InputJsonValue,
        lastSuccessAt: new Date(),
        ...(mode === "FULL" ? { lastFullSyncAt: new Date() } : {}),
        recordsSeen,
        lastError: null,
      },
    });
    return { ...counts, recordsSeen, done: true };
  }

  async sourceStates() {
    const states = await this.prisma.sourceSyncState.findMany({ orderBy: [{ sourceKey: "asc" }, { scope: "asc" }] });
    return this.providers.map((provider) => ({
      key: provider.key,
      enabled: provider.isEnabled(),
      disabledReason: provider.disabledReason(),
      scopes: provider.listScopes().map((scope) => {
        const state = states.find((s) => s.sourceKey === provider.key && s.scope === scope);
        return {
          scope,
          mode: state?.mode ?? "FULL",
          fullSyncRequested: state?.fullSyncRequested ?? false,
          running: Boolean(state?.runStartedAt),
          lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
          lastError: state?.lastError ?? null,
          recordsSeen: state?.recordsSeen ?? 0,
        };
      }),
    }));
  }

  // -------------------------------------------------------------------------------------------
  // Search-on-miss
  // -------------------------------------------------------------------------------------------

  private searchProviders(): DiscoveryProvider[] {
    return this.providers.filter((p) => p.isEnabled() && typeof p.searchByName === "function");
  }

  isSearchOnMissAvailable(): boolean {
    return searchOnMissConfig().enabled && this.searchProviders().length > 0;
  }

  async createRequest(query: string): Promise<DiscoveryRequestResponse> {
    if (!this.isSearchOnMissAvailable()) return this.response(null, "UNAVAILABLE", [], null);
    const gate = looksLikeCompanyQuery(query);
    if (!gate.ok) throw new BadRequestException("Bitte gib einen Firmennamen ein (keine Adresse, PLZ, E-Mail oder URL).");
    const local = await this.nameSearch.search(gate.normalized, { statuses: [RecordStatus.ACTIVE], limit: 5, minScore: 0.6 });
    if (local.length) return this.response(null, "NOT_NEEDED", local.map((l) => l.landlordId), null);

    const hourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.prisma.discoveryQuery.count({ where: { lastRequestedAt: { gte: hourAgo }, startedAt: { gte: hourAgo } } });
    if (recent >= searchOnMissConfig().maxPerHour)
      throw new HttpException("Zu viele Suchanfragen. Bitte versuche es später erneut.", HttpStatus.TOO_MANY_REQUESTS);

    const queryHash = keyedHash("discovery-query", gate.normalized);
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.discoveryQuery.upsert({
        where: { queryHash },
        create: { id: randomUUID(), queryHash, normalizedQuery: gate.normalized.slice(0, 120), expiresAt: new Date(now.getTime() + 30 * DAY) },
        update: { requestCount: { increment: 1 }, lastRequestedAt: now },
      });
      const running = row.status === DiscoveryQueryStatus.PENDING || row.status === DiscoveryQueryStatus.RUNNING;
      const fresh = row.requestCount === 1;
      if (!fresh && (running || (row.retryAfter && row.retryAfter > now)))
        return this.response(row.id, row.status, row.resultLandlordIds, row.completedAt);
      const claimed = await tx.discoveryQuery.update({
        where: { id: row.id },
        data: { status: DiscoveryQueryStatus.PENDING, normalizedQuery: gate.normalized.slice(0, 120), startedAt: now, completedAt: null },
      });
      const { job } = await this.jobs.enqueue(
        { type: DISCOVERY_JOBS.SEARCH_ON_MISS, payload: { discoveryQueryId: row.id }, dedupeKey: `discovery.search:${row.id}`, priority: 10, maxAttempts: 2 },
        tx,
      );
      await tx.discoveryQuery.update({ where: { id: row.id }, data: { jobId: job.id } });
      return this.response(claimed.id, claimed.status, [], null);
    });
  }

  async getRequest(id: string): Promise<DiscoveryRequestResponse> {
    const row = /^[0-9a-f-]{36}$/i.test(id) ? await this.prisma.discoveryQuery.findUnique({ where: { id } }) : null;
    if (!row) throw new HttpException("Anfrage nicht gefunden.", HttpStatus.NOT_FOUND);
    return this.response(row.id, row.status, row.resultLandlordIds, row.completedAt);
  }

  async runSearchOnMiss(id: string, ctx: JobContext): Promise<unknown> {
    const row = await this.prisma.discoveryQuery.findUnique({ where: { id } });
    if (!row || !row.normalizedQuery) return { skipped: true };
    await this.prisma.discoveryQuery.update({ where: { id }, data: { status: DiscoveryQueryStatus.RUNNING } });
    const query = row.normalizedQuery;
    const wanted = normalizeCompanyName(query);
    const settled = await Promise.allSettled(this.searchProviders().map((p) => p.searchByName!(query, ctx.signal)));
    const allOk = settled.every((s) => s.status === "fulfilled");
    const hits = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    const ids = new Set<string>();
    let candidates = 0;
    let resolved = 0;
    for (const record of hits) {
      if (resolved >= 5) break;
      // Only hits whose name actually resembles the query.
      const similar = scoreCompanyMatch(
        { names: [{ normalized: wanted.normalized, legalForm: wanted.legalForm, kind: "primary" }], identifiers: [], websiteDomain: null, postalCode: null, city: null },
        { names: [{ ...normalizeCompanyName(record.legalName ?? record.name), kind: "primary" }], identifiers: [], websiteDomain: null, postalCode: null, city: null },
      );
      const tokensMatch = normalizeCompanyName(record.name).normalized.includes(wanted.normalized);
      if (similar.decision === "different" && !tokensMatch) continue;
      resolved++;
      const result = await this.resolver.upsertFromSource(record, { jobId: ctx.jobId, trigger: "search_on_miss" });
      if (result.landlordId && result.landlordStatus === RecordStatus.ACTIVE) ids.add(result.landlordId);
      else if (result.landlordId) candidates++;
    }
    const status: DiscoveryQueryStatus = ids.size
      ? DiscoveryQueryStatus.FOUND
      : candidates
        ? DiscoveryQueryStatus.NEEDS_REVIEW
        : allOk
          ? DiscoveryQueryStatus.NOT_FOUND
          : DiscoveryQueryStatus.FAILED;
    const failureCount = status === DiscoveryQueryStatus.FAILED ? row.failureCount + 1 : 0;
    const retryMs = RETRY_AFTER[status] ?? Math.min(15 * 60_000 * 2 ** Math.max(0, failureCount - 1), DAY);
    await this.prisma.discoveryQuery.update({
      where: { id },
      data: {
        status,
        resultLandlordIds: [...ids],
        completedAt: new Date(),
        retryAfter: new Date(Date.now() + retryMs),
        failureCount,
        // The clear text is kept only while an admin still has to review the candidates.
        normalizedQuery: status === DiscoveryQueryStatus.NEEDS_REVIEW ? row.normalizedQuery : null,
      },
    });
    return { status, found: ids.size, candidates };
  }

  async purgeQueries(): Promise<unknown> {
    const now = new Date();
    const deleted = await this.prisma.discoveryQuery.deleteMany({ where: { expiresAt: { lt: now } } });
    const stale = await this.prisma.discoveryQuery.updateMany({
      where: { status: { in: [DiscoveryQueryStatus.PENDING, DiscoveryQueryStatus.RUNNING] }, startedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
      data: { status: DiscoveryQueryStatus.FAILED, normalizedQuery: null, completedAt: now },
    });
    return { deleted: deleted.count, failed: stale.count };
  }

  private async response(
    id: string | null,
    status: DiscoveryStatusApi,
    landlordIds: string[],
    completedAt: Date | null,
  ): Promise<DiscoveryRequestResponse> {
    const terminal = !["PENDING", "RUNNING"].includes(status);
    return {
      id,
      status,
      message: MESSAGES[status],
      landlords: await this.summaries.summarize(landlordIds),
      pollAfterMs: terminal ? null : 2_000,
      completedAt: completedAt?.toISOString() ?? null,
    };
  }
}
