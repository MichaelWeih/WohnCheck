import {
  AliasType,
  CompanyKind,
  CompanyRelationType,
  Landlord,
  LocationType,
  Prisma,
  RecordStatus,
} from "@prisma/client";
import { LandlordRef, LandlordSummary } from "../../common/api/api-types";

/**
 * CONTRACT of the companies module (identity of landlords).
 *
 * Producers: discovery providers emit `DiscoveredCompany` records.
 * Consumer:  `CompanyResolverService.upsertFromSource()` decides whether a record is a known landlord
 *            (update), a new one (create) or an uncertain match (CANDIDATE + MergeCandidate for manual review).
 *
 * Other modules depend ONLY on what this file declares (abstract classes are the Nest DI tokens;
 * CompaniesModule binds them with `{ provide: X, useClass: XImpl }` and exports them), plus the pure
 * helpers of `companies/normalization.ts`, whose exported signatures are fixed in
 * docs/vermieter-verzeichnis.md section 3.
 */

// ---------------------------------------------------------------------------------------------
// Legal forms
// ---------------------------------------------------------------------------------------------

/** Canonical legal form codes. Stored in Landlord.legalForm / LandlordAlias.legalForm. */
export type LegalFormCode =
  | "GMBH" | "GGMBH" | "UG" | "AG" | "SE" | "KGAA" | "GMBH_CO_KG" | "AG_CO_KG" | "SE_CO_KG" | "UG_CO_KG"
  | "KG" | "OHG" | "EG" | "EV" | "AOER" | "KDOER" | "STIFTUNG"
  // Forms that are (or may be) natural persons / partnerships of natural persons — never auto-collected:
  | "GBR" | "EK" | "PARTG";

/** Forms whose bearer is a legal entity and may be collected automatically. */
export const COLLECTABLE_LEGAL_FORMS: readonly LegalFormCode[] = [
  "GMBH", "GGMBH", "UG", "AG", "SE", "KGAA", "GMBH_CO_KG", "AG_CO_KG", "SE_CO_KG", "UG_CO_KG",
  "KG", "OHG", "EG", "EV", "AOER", "KDOER", "STIFTUNG",
];

// ---------------------------------------------------------------------------------------------
// Discovered records
// ---------------------------------------------------------------------------------------------

/**
 * One record of an external source, mapped by a DiscoveryProvider.
 *
 * Rules for producers:
 * - Only fields the source actually states. Never guess or synthesise values.
 * - Germany only: `headquarters.country` must be "DE" or undefined.
 * - Natural persons and sole proprietors must be dropped by the provider. The resolver additionally
 *   fails closed: a record is stored only if `entityNature` is "legal_entity" or a collectable legal
 *   form is known (field `legalForm`, or found in `legalName` / `name` by the normalizer).
 * - The record's own id in the source goes into `sourceKey` + `externalId`; providers MUST ALSO emit it
 *   as an identifier when the source id is itself an identifier scheme (LEI for gleif, QID for wikidata).
 */
export interface DiscoveredCompany {
  /** Source key from SOURCE_CATALOG, e.g. "wikidata", "gleif", "osm", "offeneregister". */
  sourceKey: string;
  /** Stable id of the record inside the source (QID, LEI, "node/123", "R2201_HRB16879"). */
  externalId: string;
  /** Human-readable URL of the record in the source, for provenance display. */
  sourceUrl?: string;
  /** Licence of the source data, e.g. "CC0-1.0", "ODbL-1.0". Must equal SOURCE_CATALOG[sourceKey].license. */
  license: string;

  /**
   * - "entity":   the record describes the company itself (Wikidata item, LEI record, register entry).
   * - "location": the record is ONE site of some company (an OSM office). Its name is never used as an
   *               alias and it never becomes a landlord of its own when `locationOf` resolves.
   */
  recordKind: "entity" | "location";
  /** recordKind "location" only: the company this site belongs to, as stated by the source. */
  locationOf?: CompanyPointer & { via: "operator" | "brand" };

  /** Best display name stated by the source. */
  name: string;
  /** Registered name incl. legal form, if the source distinguishes it from `name`. */
  legalName?: string;
  /** True when `name` (or `legalName`, if given) is an officially REGISTERED name (GLEIF, register dump). */
  nameIsRegistered?: boolean;
  aliases?: DiscoveredAlias[];
  /** Legal form if the source states it explicitly (e.g. GLEIF ELF code mapped to our codes). */
  legalForm?: LegalFormCode;
  /**
   * Legal nature as STATED by the source — never guessed:
   * "legal_entity" only when the source classifies the record as a corporation / cooperative / organisation.
   */
  entityNature: "legal_entity" | "unknown";

  /** Company type if the source states it; omit otherwise (the resolver may derive it from the registered name). */
  kind?: CompanyKind;
  /**
   * Evidence that this is a landlord-type business:
   * - "confirmed": the source classifies it as such (narrow housing class, office=property_management) —
   *                OR the resolver finds a strong housing keyword in a REGISTERED name (providers may leave
   *                that to the resolver and pass "unknown").
   * - "likely":    indirect evidence only (broad real-estate class / industry).
   * - "unknown":   no evidence.
   */
  relevance: "confirmed" | "likely" | "unknown";

  website?: string;
  identifiers?: DiscoveredIdentifier[];
  headquarters?: DiscoveredAddress;
  /** Additional offices / branches (not the headquarters). For recordKind "location": exactly the site itself. */
  locations?: DiscoveredLocation[];
  /** Direct relations only (no ultimate parents). */
  relations?: DiscoveredRelation[];
  /** References to external platforms the source itself states (e.g. Wikidata P5161, P3984). */
  externalReferences?: DiscoveredExternalReference[];
  /** "inactive" for dissolved entities. A lapsed LEI registration alone is NOT "inactive". */
  entityStatus?: "active" | "inactive";
  /** When the provider fetched the record. Not part of the stored payload / content hash. */
  fetchedAt: Date;
}

export interface DiscoveredAlias {
  name: string;
  type?: AliasType;
}

/**
 * Identifiers are structured so that a register number can never be confused across courts.
 * The resolver canonicalises them with canonicalIdentifier() (returns null => identifier is dropped, never stored).
 */
export type DiscoveredIdentifier =
  | { scheme: "LEI"; value: string }
  | { scheme: "WIKIDATA"; value: string }
  | {
      scheme: "GERMAN_REGISTER";
      registerType: "HRA" | "HRB" | "GnR" | "PR" | "VR" | "GsR";
      /** Digits plus optional letter suffix as stated, e.g. "16879", "12345 B". */
      number: string;
      /** XJustiz court code, e.g. "R2201" (Amtsgericht Bochum). Mandatory — without it the identifier must not be emitted. */
      courtCode: string;
    };

export interface DiscoveredAddress {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  /** ISO 3166-2 code, e.g. "DE-BE" (use toGermanStateCode(); never derive it from the postal code). */
  state?: string;
  /** ISO 3166-1 alpha-2, e.g. "DE". */
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface DiscoveredLocation extends DiscoveredAddress {
  type: LocationType;
  name?: string;
  /** Stable id of the location in the source (e.g. "node/123456"). The resolver derives one when missing. */
  externalRef?: string;
}

/** Points to another company by an identifier and/or by its id in a source. */
export interface CompanyPointer {
  identifier?: DiscoveredIdentifier;
  sourceRef?: { sourceKey: string; externalId: string };
  /** Name as stated by the source — for logs only, never used for matching. */
  name?: string;
}

export interface DiscoveredRelation {
  type: CompanyRelationType;
  /**
   * - "outgoing": (this company) <type> (other), e.g. this PARENT_OF other
   * - "incoming": (other) <type> (this company), e.g. other PARENT_OF this
   */
  direction: "outgoing" | "incoming";
  other: CompanyPointer;
}

export interface DiscoveredExternalReference {
  /** Platform key, e.g. "trustpilot", "reddit". */
  platform: string;
  type: "PROFILE" | "DISCUSSION";
  /** Id on the platform as stated by the source (Trustpilot slug, subreddit name). */
  externalId: string;
}

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

export type ResolutionOutcome =
  /** New public landlord created (status ACTIVE). */
  | "created"
  /** New landlord created as CANDIDATE (possible duplicate or insufficient relevance); not public. */
  | "candidate_created"
  /** Matched an existing landlord and changed at least one field / alias / identifier / location. */
  | "updated"
  /** Matched an existing landlord; nothing new (only lastSeenAt / lastRefreshedAt were bumped). */
  | "unchanged"
  /** recordKind "location": stored only as a LandlordLocation of an existing landlord. */
  | "location_attached"
  /** Not stored at all. */
  | "skipped";

export interface ResolutionResult {
  outcome: ResolutionOutcome;
  /** Affected landlord; undefined when skipped. */
  landlordId?: string;
  /** Status of that landlord after resolution. */
  landlordStatus?: RecordStatus;
  /** Merge candidates created or refreshed by this resolution. */
  mergeCandidateIds: string[];
  /** Identifiers of the record that already belong to ANOTHER landlord (nothing was moved). */
  conflicts: Array<{ scheme: string; value: string; otherLandlordId: string }>;
  /** Relations whose other side is not known yet (stored as PendingRelation). */
  unresolvedRelations: number;
  /**
   * Short machine-readable reason, e.g. "matched:source", "matched:identifier:LEI", "matched:name+domain",
   * "new", "candidate:similar_name", "candidate:relevance", "skipped:not_germany", "skipped:not_legal_entity",
   * "skipped:suppressed", "skipped:rejected", "skipped:inactive_unknown".
   */
  reason: string;
}

export interface ResolutionContext {
  /** Background job that triggered the resolution, recorded in the change log. */
  jobId?: string;
  /**
   * - "sync" (default): periodic / manual bulk import.
   * - "search_on_miss": triggered by an anonymous visitor. A NEW record becomes ACTIVE only if it carries an
   *   official identifier (LEI or register number) or its source is not publicly editable; otherwise CANDIDATE.
   */
  trigger?: "sync" | "search_on_miss";
}

/** Decision of the pure matching function for a pair of company descriptions. */
export type MatchDecision =
  /** Certainly the same entity — safe to link automatically. */
  | "same"
  /** Possibly the same — must go to manual review as MergeCandidate, never auto-merged. */
  | "candidate"
  /** Different entities. */
  | "different";

export interface MergeActor {
  /** Admin user id; undefined for system actions. */
  userId?: string;
}

// ---------------------------------------------------------------------------------------------
// Services other modules inject (DI tokens)
// ---------------------------------------------------------------------------------------------

export abstract class CompanyResolverService {
  /**
   * Idempotent. Never throws for bad data (returns outcome "skipped"); throws only on infrastructure errors.
   * Serialises identity writes internally (advisory lock), so callers may run it concurrently.
   */
  abstract upsertFromSource(record: DiscoveredCompany, ctx?: ResolutionContext): Promise<ResolutionResult>;

  /**
   * After a COMPLETED full sync: marks SourceRecords of that source (optionally limited to externalIds with the
   * given prefix) that were not seen since `runStartedAt` as removed (SourceRecord.removedAt). Returns the count.
   */
  abstract markUnseenSourceRecords(sourceKey: string, runStartedAt: Date, externalIdPrefix?: string): Promise<number>;
}

export abstract class CompanyMergeService {
  /** Throws BadRequestException when the merge is not allowed (same id, differing LEIs, wrong status, ...). */
  abstract merge(survivorId: string, loserId: string, actor: MergeActor, options?: { force?: boolean }): Promise<{ mergeId: string }>;
  abstract unmerge(mergeId: string, actor: MergeActor): Promise<void>;
}

/**
 * The ONLY way public endpoints (and reviews / auth) turn a landlord id from a URL into a record.
 * Guarantees that non-public records never leak and that merged ids keep working.
 */
export abstract class PublicLandlordLookupService {
  /**
   * ACTIVE -> itself; MERGED -> follows mergedIntoId (max 5 hops) to an ACTIVE survivor;
   * anything else -> throws NotFoundException("Vermieter nicht gefunden.").
   */
  abstract resolve(id: string): Promise<{ landlord: Landlord; redirectedFromId: string | null }>;
  /** Same, but returns null instead of throwing. */
  abstract tryResolve(id: string): Promise<{ landlord: Landlord; redirectedFromId: string | null } | null>;
}

export interface LandlordNameMatch {
  landlordId: string;
  /** 0..1 word similarity of the best matching name. */
  score: number;
  /** The alias that matched best, when it was not the display name. */
  matchedAlias: string | null;
}

/** Fuzzy name search over Landlord.normalizedName and LandlordAlias.normalizedName (pg_trgm). */
export abstract class LandlordNameSearchService {
  /**
   * `query` is raw user / source text; it is normalised internally (normalizeSearchText).
   * Results are deduplicated by landlord and ordered by score desc. Returns [] for queries
   * shorter than 2 characters after normalisation.
   */
  abstract search(
    query: string,
    options: { statuses: RecordStatus[]; limit: number; kind?: CompanyKind; state?: string; minScore?: number },
    tx?: Prisma.TransactionClient,
  ): Promise<LandlordNameMatch[]>;
}

/**
 * The ONLY place that turns landlord rows into the public card type `LandlordSummary`
 * (labels, null handling, rating summary from published reviews). Used by directory (lists, search),
 * companies (profile, relations), discovery (search-on-miss results) so all of them return identical cards.
 */
export abstract class LandlordSummaryService {
  /**
   * Public cards for the given landlord ids, in input order. Ids that do not exist or are not ACTIVE
   * are omitted (never leaked). One grouped query for the rating summaries, no N+1.
   */
  abstract summarize(ids: string[]): Promise<LandlordSummary[]>;
  /** Small reference used inside other responses (relations, property parties). */
  abstract toRef(landlord: Pick<Landlord, "id" | "slug" | "name" | "kind" | "city">): LandlordRef;
}

/** Job types owned by the companies module. */
export const COMPANY_JOBS = {
  /** payload: {} — creates MergeCandidates for pairs with identical normalizedName or websiteDomain that have none yet. Local only. */
  FIND_DUPLICATES: "companies.find-duplicates",
} as const;
