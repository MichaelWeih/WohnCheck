import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CompanyKind,
  ListingStatus,
  MappingReportKind,
  MappingReportStatus,
  PartyVerificationStatus,
  Prisma,
  PropertyRole,
  RecordStatus,
  TargetType,
} from "@prisma/client";
import {
  DirectoryStatsResponse,
  LandlordDetailResponse,
  LandlordListResponse,
  LandlordProfileResponse,
  LandlordSearchHit,
  LandlordSort,
  PropertyDetailResponse,
  PropertyLookupResponse,
  PropertyRelationView,
  SearchResponse,
  SuggestResponse,
} from "../../common/api/api-types";
import { GERMAN_STATE_CODES, germanStateLabel, isGermanStateCode } from "../../common/geo/german-states";
import { getSourceEntry, sourceRecordUrl } from "../../common/sources/source-catalog";
import { COMPANY_KIND_LABELS } from "../companies/company-kind";
import { LandlordNameSearchService, PublicLandlordLookupService } from "../companies/company.types";
import { LandlordSummaryServiceImpl, OWN_REVIEW_FILTER } from "../companies/landlord-summary.service";
import { legalFormLabel, addressKey, foldText, looksLikeCompanyQuery, normalizeSearchText, normalizeStreet } from "../companies/normalization";
import { DiscoveryService } from "../discovery/discovery.service";
import { PrismaService } from "../prisma/prisma.service";

type DirectoryListing = Prisma.ListingGetPayload<{ include: { district: { include: { rentPrices: true } }; sourceProvider: { include: { qualityScore: true } } } }>;
type PartyRow = Prisma.PropertyPartyGetPayload<{ include: { landlord: true } }>;

export const ROLE_LABELS: Record<PropertyRole, string> = {
  OWNER: "Eigentümer",
  LANDLORD: "Vermieter",
  MANAGER: "Hausverwaltung",
};
const ALIAS_LABELS: Record<string, string> = {
  LEGAL_NAME: "Registrierter Name",
  BRAND: "Marke",
  FORMER_NAME: "Früherer Name",
  SHORT_NAME: "Kurzname",
  SPELLING: "Schreibweise",
};
const RELATION_LABELS: Record<string, { outgoing: string; incoming: string }> = {
  PARENT_OF: { outgoing: "Tochtergesellschaft", incoming: "Muttergesellschaft" },
  MANAGES_FOR: { outgoing: "Verwaltet für", incoming: "Verwaltet durch" },
  SUCCESSOR_OF: { outgoing: "Rechtsvorgänger", incoming: "Rechtsnachfolger" },
};
const AUTO_NOTICE = "Automatisch aus offenen Quellen erfasst, nicht redaktionell geprüft.";
const CITY_CACHE_MS = 10 * 60_000;

type Rating = { ratingOverall: number | null; reviewCount: number };

/**
 * Public directory: landlords (ACTIVE only), buildings with their organisations, neighbourhoods, search.
 * Landlord search runs over the stored directory only (LandlordNameSearchService); it never calls external
 * sources — that is search-on-miss (button) or the import pipeline.
 */
@Injectable()
export class DirectoryService {
  private cityCache: { at: number; cities: Map<string, string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nameSearch: LandlordNameSearchService,
    private readonly lookup: PublicLandlordLookupService,
    private readonly summaries: LandlordSummaryServiceImpl,
    private readonly discovery: DiscoveryService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Landlords
  // -------------------------------------------------------------------------------------------

  async getLandlords(options: { limit?: number; offset?: number; kind?: CompanyKind; state?: string; sort?: LandlordSort }): Promise<LandlordListResponse> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const where: Prisma.LandlordWhereInput = {
      status: RecordStatus.ACTIVE,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.state ? { OR: [{ state: options.state }, { operatingStates: { has: options.state } }] } : {}),
    };
    const total = await this.prisma.landlord.count({ where });
    let ids: string[];
    if (options.sort === "reviews" || options.sort === "rating") {
      // Rating sorts need the aggregated reviews; the directory is small enough to rank in memory.
      const all = await this.prisma.landlord.findMany({ where, select: { id: true, name: true } });
      const stats = await this.summaries.ratingStats(all.map((l) => l.id));
      const key = (id: string) =>
        options.sort === "reviews" ? stats.get(id)?.reviewCount ?? 0 : stats.get(id)?.ratingOverall ?? -1;
      ids = all.sort((a, b) => key(b.id) - key(a.id) || a.name.localeCompare(b.name, "de")).slice(offset, offset + limit).map((l) => l.id);
    } else {
      const rows = await this.prisma.landlord.findMany({
        where,
        select: { id: true },
        orderBy: options.sort === "recent" ? { createdAt: "desc" } : { name: "asc" },
        skip: offset,
        take: limit,
      });
      ids = rows.map((r) => r.id);
    }
    return { items: await this.summaries.summarize(ids), total, limit, offset };
  }

  async getLandlordById(id: string): Promise<LandlordDetailResponse & Record<string, unknown>> {
    const { landlord, redirectedFromId } = await this.lookup.resolve(id);
    const [summary] = await this.summaries.summarize([landlord.id]);
    const [parties, listings, profile] = await Promise.all([
      this.prisma.propertyParty.findMany({
        where: { landlordId: landlord.id, verificationStatus: { in: [PartyVerificationStatus.VERIFIED, PartyVerificationStatus.HISTORIC] } },
        include: { property: true },
        orderBy: [{ property: { city: "asc" } }, { property: { street: "asc" } }],
      }),
      this.prisma.listing.findMany({
        where: { landlordId: landlord.id },
        include: {
          district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
          sourceProvider: { include: { qualityScore: true } },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 12,
      }),
      this.prisma.landlordProfile.findUnique({ where: { landlordId: landlord.id } }),
    ]);
    const byProperty = new Map<string, { property: (typeof parties)[number]["property"]; roles: PropertyRelationView[] }>();
    for (const party of parties) {
      const entry = byProperty.get(party.propertyId) ?? { property: party.property, roles: [] };
      entry.roles.push(this.relationView({ ...party, landlord }));
      byProperty.set(party.propertyId, entry);
    }
    const propertyRatings = await this.ratingStats(TargetType.PROPERTY, [...byProperty.keys()]);
    return {
      ...summary,
      redirectedFromId,
      properties: [...byProperty.values()].map(({ property, roles }) => ({
        id: property.id,
        street: property.street,
        houseNumber: property.houseNumber,
        postalCode: property.postalCode,
        city: property.city,
        slug: property.slug,
        landlordId: property.landlordId ?? "",
        neighborhoodId: property.neighborhoodId,
        roles,
        ...(propertyRatings.get(property.id) ?? { ratingOverall: null, reviewCount: 0 }),
      })),
      listings: listings.map((listing) => this.toLandlordListingCard(listing)),
      profile: profile ?? (listings.length ? this.buildLandlordProfileFromListings(listings) : null),
    };
  }

  /** GET /landlords/:id/profile: identity, relations, locations and provenance of an ACTIVE landlord. */
  async getLandlordProfile(id: string): Promise<LandlordProfileResponse> {
    const { landlord, redirectedFromId } = await this.lookup.resolve(id);
    const [summary] = await this.summaries.summarize([landlord.id]);
    const [aliases, identifiers, relationsFrom, relationsTo, locations, records] = await Promise.all([
      this.prisma.landlordAlias.findMany({ where: { landlordId: landlord.id }, orderBy: { name: "asc" } }),
      this.prisma.landlordIdentifier.findMany({ where: { landlordId: landlord.id } }),
      this.prisma.companyRelation.findMany({ where: { fromLandlordId: landlord.id, to: { status: RecordStatus.ACTIVE } }, include: { to: true } }),
      this.prisma.companyRelation.findMany({ where: { toLandlordId: landlord.id, from: { status: RecordStatus.ACTIVE } }, include: { from: true } }),
      this.prisma.landlordLocation.findMany({ where: { landlordId: landlord.id }, orderBy: [{ type: "asc" }, { city: "asc" }] }),
      this.prisma.sourceRecord.findMany({ where: { landlordId: landlord.id, removedAt: null }, orderBy: { firstSeenAt: "asc" } }),
    ]);
    const isPrivate = landlord.kind === CompanyKind.PRIVATE_LANDLORD;
    const sources = new Map<string, typeof records>();
    for (const record of records) sources.set(record.sourceKey, [...(sources.get(record.sourceKey) ?? []), record]);
    return {
      landlord: {
        ...summary,
        legalName: landlord.legalName,
        legalForm: landlord.legalForm,
        legalFormLabel: legalFormLabel(landlord.legalForm as never),
        // Private landlords: no address details are ever published.
        postalCode: isPrivate ? null : landlord.postalCode,
        operatingStates: landlord.operatingStates.filter(isGermanStateCode).map((state) => ({ state, label: germanStateLabel(state)! })),
        verificationNotice: landlord.verificationStatus === "MANUALLY_VERIFIED" ? null : AUTO_NOTICE,
        lastRefreshedAt: landlord.lastRefreshedAt?.toISOString() ?? null,
      },
      redirectedFromId,
      aliases: aliases.map((a) => ({ name: a.name, type: a.type, typeLabel: ALIAS_LABELS[a.type] ?? "Name" })),
      identifiers: identifiers.map((id) => this.identifierView(id.scheme, id.value)),
      relations: [
        ...relationsFrom.map((r) => ({ type: r.type, direction: "outgoing" as const, label: RELATION_LABELS[r.type].outgoing, other: this.summaries.toRef(r.to), sourceKey: r.source })),
        ...relationsTo.map((r) => ({ type: r.type, direction: "incoming" as const, label: RELATION_LABELS[r.type].incoming, other: this.summaries.toRef(r.from), sourceKey: r.source })),
      ],
      locations: isPrivate
        ? []
        : locations.map((l) => ({
            id: l.id,
            type: l.type,
            name: l.name,
            street: l.street,
            houseNumber: l.houseNumber,
            postalCode: l.postalCode,
            city: l.city,
            state: isGermanStateCode(l.state) ? l.state : null,
            sourceKey: l.source,
          })),
      sources: [...sources.entries()].map(([key, rows]) => {
        const entry = getSourceEntry(key);
        return {
          sourceKey: key,
          displayName: entry?.displayName ?? key,
          license: entry?.license ?? "unbekannt",
          licenseUrl: entry?.licenseUrl ?? null,
          attribution: entry?.attribution ?? null,
          attributionUrl: entry?.attributionUrl ?? null,
          note: entry?.note ?? null,
          recordCount: rows.length,
          recordUrls: rows.slice(0, 5).map((r) => r.url ?? sourceRecordUrl(key, r.externalId)).filter((u): u is string => Boolean(u)),
          firstSeenAt: rows[0].firstSeenAt.toISOString(),
          lastSeenAt: rows.reduce((max, r) => (r.lastSeenAt > max ? r.lastSeenAt : max), rows[0].lastSeenAt).toISOString(),
        };
      }),
    };
  }

  private identifierView(scheme: string, value: string): LandlordProfileResponse["identifiers"][number] {
    if (scheme === "LEI")
      return { scheme: "LEI", schemeLabel: "LEI", display: value, value, links: [{ label: "Bei GLEIF ansehen", url: `https://search.gleif.org/#/record/${value}` }] };
    if (scheme === "WIKIDATA")
      return { scheme: "WIKIDATA", schemeLabel: "Wikidata", display: value, value, links: [{ label: "Bei Wikidata ansehen", url: `https://www.wikidata.org/wiki/${value}` }] };
    const match = /^([A-Z]\d{4})_([A-Za-z]+)(\S+)$/.exec(value);
    return {
      scheme: "GERMAN_REGISTER",
      schemeLabel: "Handelsregister",
      display: match ? `${match[2]} ${match[3]} (Registergericht ${match[1]})` : value,
      value,
      links: [{ label: "Bei OpenCorporates ansehen", url: `https://opencorporates.com/companies/de/${value}` }],
    };
  }

  async getLandlordListings(id: string) {
    const { landlord } = await this.lookup.resolve(id);
    const listings = await this.prisma.listing.findMany({
      where: { landlordId: landlord.id, status: ListingStatus.AVAILABLE },
      include: {
        district: { include: { rentPrices: { where: { metric: "rent_cold" }, take: 1 } } },
        sourceProvider: { include: { qualityScore: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
    });
    return { landlordId: landlord.id, total: listings.length, items: listings.map((listing) => this.toLandlordListingCard(listing)) };
  }

  // -------------------------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------------------------

  /** Folded city names of the directory (seat, offices, buildings), refreshed every 10 minutes. */
  private async knownCities(): Promise<Map<string, string>> {
    if (this.cityCache && Date.now() - this.cityCache.at < CITY_CACHE_MS) return this.cityCache.cities;
    const rows = await this.prisma.$queryRaw<Array<{ city: string }>>`
      SELECT DISTINCT "city" FROM "Landlord" WHERE "city" IS NOT NULL AND "status" = 'ACTIVE'
      UNION SELECT DISTINCT "city" FROM "LandlordLocation" WHERE "city" IS NOT NULL
      UNION SELECT DISTINCT "city" FROM "Property"
      UNION SELECT DISTINCT "city" FROM "Neighborhood"`;
    const cities = new Map(rows.map((r) => [normalizeSearchText(r.city), r.city] as const).filter(([k]) => k.length >= 3));
    this.cityCache = { at: Date.now(), cities };
    return cities;
  }

  /** Splits "Vonovia Berlin" into the name part and a known city (which only ranks, never filters). */
  private async splitCity(query: string): Promise<{ name: string; city: string | null }> {
    const folded = normalizeSearchText(query);
    const cities = await this.knownCities();
    const tokens = folded.split(" ").filter(Boolean);
    for (let size = Math.min(3, tokens.length); size >= 1; size--) {
      for (let start = tokens.length - size; start >= 0; start--) {
        const candidate = tokens.slice(start, start + size).join(" ");
        if (cities.has(candidate)) {
          const rest = [...tokens.slice(0, start), ...tokens.slice(start + size)].join(" ");
          return { name: rest, city: candidate };
        }
      }
    }
    return { name: folded, city: null };
  }

  /** Seat or an office in the city (exact name as stored). */
  private async inCity(foldedCity: string): Promise<Prisma.LandlordWhereInput> {
    const name = (await this.knownCities()).get(foldedCity) ?? foldedCity;
    return {
      OR: [
        { city: { equals: name, mode: "insensitive" } },
        { locations: { some: { city: { equals: name, mode: "insensitive" } } } },
      ],
    };
  }

  private async searchLandlords(query: string, options: { limit: number; kind?: CompanyKind; state?: string }): Promise<LandlordSearchHit[]> {
    const { name, city } = await this.splitCity(query);
    let hits: Array<{ landlordId: string; score: number; matchedAlias: string | null }>;
    if (name.length >= 2) {
      hits = await this.nameSearch.search(name, { statuses: [RecordStatus.ACTIVE], limit: 50, kind: options.kind, state: options.state });
    } else if (city) {
      // Only a city was entered: landlords seated or present there.
      const rows = await this.prisma.landlord.findMany({
        where: { status: RecordStatus.ACTIVE, ...(options.kind ? { kind: options.kind } : {}), ...(await this.inCity(city)) },
        select: { id: true },
        orderBy: { name: "asc" },
        take: 50,
      });
      hits = rows.map((r) => ({ landlordId: r.id, score: 0.5, matchedAlias: null }));
    } else {
      return [];
    }
    let ranked = hits;
    if (city && name.length >= 2) {
      const present = new Set(
        (
          await this.prisma.landlord.findMany({
            where: { id: { in: hits.map((h) => h.landlordId) }, ...(await this.inCity(city)) },
            select: { id: true },
          })
        ).map((r) => r.id),
      );
      ranked = hits.map((h) => ({ ...h, score: h.score + (present.has(h.landlordId) ? 0.15 : 0) })).sort((a, b) => b.score - a.score);
    }
    const top = ranked.slice(0, options.limit);
    const cards = await this.summaries.summarize(top.map((h) => h.landlordId));
    const alias = new Map(top.map((h) => [h.landlordId, h.matchedAlias]));
    return cards.map((card) => ({ ...card, matchedAlias: alias.get(card.id) ?? null }));
  }

  /** "Kastanienallee 12", "10435", "Kaiser-Wilhelm-Str. 103 Berlin": street words, house number, postal code. */
  private parseAddressQuery(query: string): { street: string | null; houseNumber: string | null; postalCode: string | null; words: string } {
    const postalCode = /\b(\d{5})\b/.exec(query)?.[1] ?? null;
    const withoutPostal = query.replace(/\b\d{5}\b/, " ");
    const numberMatch = /^(.*?[\p{L}.])\s+(\d{1,4}\s?[a-zA-Z]?)\b/u.exec(withoutPostal.trim());
    return {
      street: numberMatch ? numberMatch[1].replace(/,$/, "").trim() : null,
      houseNumber: numberMatch ? numberMatch[2].replace(/\s+/g, "").toLowerCase() : null,
      postalCode,
      words: withoutPostal.trim(),
    };
  }

  private async searchProperties(query: string) {
    const parsed = this.parseAddressQuery(query);
    const firstWord = foldText(parsed.street ?? parsed.words).split(/[^a-z0-9]+/).find((w) => w.length >= 3);
    const or: Prisma.PropertyWhereInput[] = [];
    if (parsed.postalCode) or.push({ postalCode: parsed.postalCode });
    if (firstWord) or.push({ street: { contains: firstWord.replace(/strasse$/, ""), mode: "insensitive" } }, { city: { contains: firstWord, mode: "insensitive" } });
    if (!or.length) return [];
    const rows = await this.prisma.property.findMany({ where: { OR: or }, include: { landlord: true }, take: 200 });
    const streetKey = parsed.street ? normalizeStreet(parsed.street) : null;
    const filtered = rows.filter((row) => {
      if (parsed.postalCode && row.postalCode !== parsed.postalCode) return false;
      if (streetKey && !normalizeStreet(row.street).startsWith(streetKey.slice(0, Math.max(4, streetKey.length - 6)))) return false;
      if (parsed.houseNumber && row.houseNumber.toLowerCase().replace(/\s+/g, "") !== parsed.houseNumber) return false;
      return true;
    });
    return filtered.slice(0, 10);
  }

  async search(rawQuery: string, filters: { kind?: CompanyKind; state?: string } = {}): Promise<SearchResponse> {
    const query = rawQuery.trim().slice(0, 120);
    const empty: SearchResponse = { query, landlords: [], properties: [], neighborhoods: [], discoveryEligible: false };
    if (normalizeSearchText(query).length < 2) return empty;
    const words = normalizeSearchText(query);
    const [landlords, properties, neighborhoods] = await Promise.all([
      this.searchLandlords(query, { limit: 20, ...filters }),
      this.searchProperties(query),
      this.prisma.neighborhood.findMany({
        where: {
          OR: [
            { districtName: { contains: query, mode: "insensitive" } },
            { city: { contains: query, mode: "insensitive" } },
            { postalCode: { startsWith: query } },
            ...words.split(" ").filter((w) => w.length >= 4).map((w) => ({ districtName: { contains: w, mode: "insensitive" as const } })),
          ],
        },
        take: 10,
      }),
    ]);
    const [propertyRatings, neighborhoodRatings] = await Promise.all([
      this.ratingStats(TargetType.PROPERTY, properties.map((p) => p.id)),
      this.ratingStats(TargetType.NEIGHBORHOOD, neighborhoods.map((n) => n.id)),
    ]);
    const nothing = !landlords.length && !properties.length && !neighborhoods.length;
    return {
      query,
      landlords,
      properties: properties.map((p) => ({
        id: p.id,
        street: p.street,
        houseNumber: p.houseNumber,
        postalCode: p.postalCode,
        city: p.city,
        slug: p.slug,
        landlordId: p.landlordId ?? "",
        neighborhoodId: p.neighborhoodId,
        landlord: p.landlord && p.landlord.status === RecordStatus.ACTIVE ? { id: p.landlord.id, name: p.landlord.name, slug: p.landlord.slug } : null,
        ...(propertyRatings.get(p.id) ?? { ratingOverall: null, reviewCount: 0 }),
      })),
      neighborhoods: neighborhoods.map((n) => ({
        id: n.id,
        districtName: n.districtName,
        city: n.city,
        postalCode: n.postalCode,
        slug: n.slug,
        ...(neighborhoodRatings.get(n.id) ?? { ratingOverall: null, reviewCount: 0 }),
      })),
      discoveryEligible:
        nothing && !filters.kind && !filters.state && looksLikeCompanyQuery(query).ok && this.discovery.isSearchOnMissAvailable(),
    };
  }

  async suggest(rawQuery: string): Promise<SuggestResponse> {
    const query = rawQuery.trim().slice(0, 120);
    if (normalizeSearchText(query).length < 2) return { query, suggestions: [] };
    const [landlords, properties] = await Promise.all([this.searchLandlords(query, { limit: 6 }), this.searchProperties(query)]);
    return {
      query,
      suggestions: [
        ...landlords.map((l) => ({
          type: "landlord" as const,
          id: l.id,
          label: l.name,
          sublabel: [l.kindLabel, l.city, l.matchedAlias ? `auch: ${l.matchedAlias}` : null].filter(Boolean).join(" · "),
        })),
        ...properties.slice(0, 2).map((p) => ({ type: "property" as const, id: p.id, label: `${p.street} ${p.houseNumber}`, sublabel: `${p.postalCode} ${p.city}` })),
      ].slice(0, 8),
    };
  }

  async stats(): Promise<DirectoryStatsResponse> {
    const active = { status: RecordStatus.ACTIVE };
    const [total, verified, byKind, states, properties, neighborhoods, publishedReviews] = await Promise.all([
      this.prisma.landlord.count({ where: active }),
      this.prisma.landlord.count({ where: { ...active, verificationStatus: { in: ["AUTO_VERIFIED", "MANUALLY_VERIFIED"] } } }),
      this.prisma.landlord.groupBy({ by: ["kind"], where: active, _count: { _all: true } }),
      this.prisma.landlord.findMany({ where: active, select: { state: true, operatingStates: true } }),
      this.prisma.property.count(),
      this.prisma.neighborhood.count(),
      this.prisma.review.count({ where: OWN_REVIEW_FILTER }),
    ]);
    const stateCounts = new Map<string, number>();
    for (const row of states)
      for (const state of new Set([row.state, ...row.operatingStates].filter(Boolean) as string[])) stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    return {
      landlords: {
        total,
        verified,
        byKind: byKind.filter((k) => k._count._all > 0).map((k) => ({ kind: k.kind, label: COMPANY_KIND_LABELS[k.kind], count: k._count._all })),
        byState: GERMAN_STATE_CODES.map((state) => ({ state, label: germanStateLabel(state)!, count: stateCounts.get(state) ?? 0 })),
      },
      properties,
      neighborhoods,
      publishedReviews,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Buildings
  // -------------------------------------------------------------------------------------------

  /** Public view of a relation; only VERIFIED (current) and HISTORIC (former) rows are ever passed in. */
  relationView(party: PartyRow): PropertyRelationView {
    const current = this.isCurrent(party);
    return {
      role: party.role,
      roleLabel: ROLE_LABELS[party.role],
      landlord: this.summaries.toRef(party.landlord),
      status: current ? "current" : "former",
      statusLabel: current ? "Bestätigt" : "Früher zuständig",
      validFrom: party.validFrom?.toISOString() ?? null,
      validTo: party.validTo?.toISOString() ?? null,
      unitLabel: party.unitLabel,
      lastCheckedAt: party.lastCheckedAt?.toISOString() ?? null,
    };
  }

  private isCurrent(party: Pick<PartyRow, "verificationStatus" | "validTo" | "validFrom">): boolean {
    const now = Date.now();
    return (
      party.verificationStatus === PartyVerificationStatus.VERIFIED &&
      (!party.validTo || party.validTo.getTime() > now) &&
      (!party.validFrom || party.validFrom.getTime() <= now)
    );
  }

  /** Current verified and former relations of a building; private landlords and non-public companies never appear. */
  private async relationsOf(propertyId: string): Promise<{ parties: PropertyRelationView[]; formerParties: PropertyRelationView[] }> {
    const rows = await this.prisma.propertyParty.findMany({
      where: {
        propertyId,
        verificationStatus: { in: [PartyVerificationStatus.VERIFIED, PartyVerificationStatus.HISTORIC] },
        landlord: { status: RecordStatus.ACTIVE, kind: { not: CompanyKind.PRIVATE_LANDLORD } },
      },
      include: { landlord: true },
      orderBy: [{ role: "asc" }, { validFrom: "desc" }],
    });
    const parties = rows.filter((r) => this.isCurrent(r)).map((r) => this.relationView(r));
    const formerParties = rows.filter((r) => !this.isCurrent(r)).map((r) => this.relationView(r));
    return { parties, formerParties };
  }

  private async openReportCount(property: { id: string; addressKey: string | null }): Promise<number> {
    return this.prisma.mappingReport.count({
      where: {
        kind: MappingReportKind.PROPERTY_ASSIGNMENT,
        status: { in: [MappingReportStatus.OPEN, MappingReportStatus.IN_PROGRESS] },
        OR: [{ propertyId: property.id }, ...(property.addressKey ? [{ addressKey: property.addressKey }] : [])],
      },
    });
  }

  async getProperties() {
    const properties = await this.prisma.property.findMany({
      include: { landlord: true, neighborhood: true },
      orderBy: [{ city: "asc" }, { street: "asc" }],
    });
    const ratings = await this.ratingStats(TargetType.PROPERTY, properties.map((p) => p.id));
    return properties.map((p) => ({
      ...p,
      landlord: p.landlord && p.landlord.status === RecordStatus.ACTIVE ? { id: p.landlord.id, name: p.landlord.name, slug: p.landlord.slug } : null,
      ...(ratings.get(p.id) ?? { ratingOverall: null, reviewCount: 0 }),
    }));
  }

  async getPropertyById(id: string): Promise<PropertyDetailResponse> {
    const property = await this.prisma.property.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { neighborhood: true },
    });
    if (!property) throw new NotFoundException("Gebäude nicht gefunden.");
    const [{ parties, formerParties }, openReports, ratings] = await Promise.all([
      this.relationsOf(property.id),
      this.openReportCount(property),
      this.ratingStats(TargetType.PROPERTY, [property.id]),
    ]);
    const primary = parties.find((p) => p.role === PropertyRole.LANDLORD && !p.unitLabel)?.landlord ?? null;
    return {
      id: property.id,
      street: property.street,
      houseNumber: property.houseNumber,
      postalCode: property.postalCode,
      city: property.city,
      slug: property.slug,
      neighborhood: property.neighborhood ? { id: property.neighborhood.id, districtName: property.neighborhood.districtName, city: property.neighborhood.city } : null,
      landlord: primary,
      parties,
      formerParties,
      openReports,
      ...(ratings.get(property.id) ?? { ratingOverall: null, reviewCount: 0 }),
    };
  }

  /**
   * Who is responsible for an address? Stage 1 is the only automatic stage with a usable source today:
   * a verified relation of a building in the directory. Nothing is inferred from proximity, similar addresses
   * or the presence of a company in the area.
   */
  async lookupAddress(input: { street: string; houseNumber?: string; postalCode?: string; city?: string }): Promise<PropertyLookupResponse> {
    const address = {
      street: input.street.trim(),
      houseNumber: input.houseNumber?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      city: input.city?.trim() || null,
    };
    const unavailable = [
      { stage: 2 as const, label: "Veröffentlichte Wohnungsbestände", result: "not_available" as const },
      { stage: 3 as const, label: "Weitere öffentliche Quellen", result: "not_available" as const },
    ];
    const base = { address, parties: [] as PropertyRelationView[], formerParties: [] as PropertyRelationView[] };
    if (!address.houseNumber || !address.postalCode) {
      return {
        ...base,
        status: "none",
        reason: "no_house_number",
        property: null,
        openReports: 0,
        message: "Ohne bestätigte Hausnummer kann WohnCheck kein Gebäude und damit keinen Vermieter zuordnen.",
        checkedStages: [{ stage: 1, label: "Bestätigte Zuordnung bei WohnCheck", result: "no_match" }, ...unavailable, { stage: 4, label: "Meldungen von Nutzern", result: "no_match" }],
      };
    }
    const key = addressKey({ postalCode: address.postalCode, street: address.street, houseNumber: address.houseNumber });
    const property = key ? await this.prisma.property.findFirst({ where: { addressKey: key } }) : null;
    const openReports = await this.prisma.mappingReport.count({
      where: {
        kind: MappingReportKind.PROPERTY_ASSIGNMENT,
        status: { in: [MappingReportStatus.OPEN, MappingReportStatus.IN_PROGRESS] },
        OR: [...(key ? [{ addressKey: key }] : []), ...(property ? [{ propertyId: property.id }] : [])],
      },
    });
    const relations = property ? await this.relationsOf(property.id) : { parties: [], formerParties: [] };
    const verified = relations.parties.length > 0;
    return {
      address,
      ...relations,
      status: verified ? "verified" : "none",
      reason: verified ? null : property ? "no_verified_relation" : "unknown_building",
      property: property ? { id: property.id, slug: property.slug } : null,
      openReports,
      message: verified
        ? "Für diese Immobilie ist eine geprüfte Zuordnung hinterlegt."
        : "Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.",
      checkedStages: [
        { stage: 1, label: "Bestätigte Zuordnung bei WohnCheck", result: verified ? "match" : "no_match" },
        ...unavailable,
        { stage: 4, label: "Meldungen von Nutzern", result: openReports ? "match" : "no_match" },
      ],
    };
  }

  // -------------------------------------------------------------------------------------------
  // Neighbourhoods
  // -------------------------------------------------------------------------------------------

  async getNeighborhoods() {
    const neighborhoods = await this.prisma.neighborhood.findMany({ include: { properties: true }, orderBy: [{ city: "asc" }, { districtName: "asc" }] });
    const ratings = await this.ratingStats(TargetType.NEIGHBORHOOD, neighborhoods.map((n) => n.id));
    return neighborhoods.map((n) => ({ ...n, ...(ratings.get(n.id) ?? { ratingOverall: null, reviewCount: 0 }), ratings: {} }));
  }

  async getNeighborhoodById(id: string) {
    const neighborhood = await this.prisma.neighborhood.findUnique({ where: { id }, include: { properties: true } });
    if (!neighborhood) throw new NotFoundException("Profil nicht gefunden.");
    const ratings = await this.ratingStats(TargetType.NEIGHBORHOOD, [id]);
    return { ...neighborhood, ...(ratings.get(id) ?? { ratingOverall: null, reviewCount: 0 }), ratings: {} };
  }

  // -------------------------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------------------------

  private async ratingStats(targetType: TargetType, ids: string[]): Promise<Map<string, Rating>> {
    if (!ids.length) return new Map();
    const groups = await this.prisma.review.groupBy({
      by: ["targetId"],
      where: { targetType, targetId: { in: ids }, ...OWN_REVIEW_FILTER },
      _avg: { overallRating: true },
      _count: { _all: true },
    });
    return new Map(
      groups.map((g) => [g.targetId, { ratingOverall: g._avg.overallRating === null ? null : Number(Number(g._avg.overallRating).toFixed(2)), reviewCount: g._count._all }]),
    );
  }

  private buildLandlordProfileFromListings(listings: DirectoryListing[]) {
    const activeListings = listings.filter((listing) => listing.status === ListingStatus.AVAILABLE);
    const prices = activeListings.map((l) => (l.pricePerSqm ? Number(l.pricePerSqm) : null)).filter((p): p is number => p !== null);
    return {
      isExternalCandidate: false,
      knownListingsCount: listings.length,
      activeListingsCount: activeListings.length,
      averagePricePerSqm: prices.length ? Number((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)) : null,
      activeDistricts: Array.from(new Set(activeListings.map((l) => l.districtName).filter(Boolean))),
      lastUpdatedAt: activeListings[0]?.updatedAt ?? null,
      dataQuality: null,
      summary: "Angaben aus Wohnungsangeboten, die WohnCheck vorliegen.",
    };
  }

  private toLandlordListingCard(listing: DirectoryListing) {
    const districtMedian = listing.district?.rentPrices?.[0]?.valuePerSqm ? Number(listing.district.rentPrices[0].valuePerSqm) : null;
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
      sourceProvider: listing.sourceProvider
        ? {
            key: listing.sourceProvider.key,
            name: listing.sourceProvider.name,
            legalUseStatus: listing.sourceProvider.legalUseStatus,
            qualityScore: listing.sourceProvider.qualityScore?.overallScore ?? null,
          }
        : null,
    };
  }
}

