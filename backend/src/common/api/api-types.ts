/**
 * Shared response / request types of the PUBLIC API of the landlord directory.
 *
 * ZERO imports — this file is also consumed by the frontend through a type-only re-export
 * (src/features/api-types.ts), so it must not reference @prisma/client or NestJS.
 *
 * Conventions:
 * - Dates are ISO-8601 strings. Numbers are JSON numbers (never Prisma Decimal strings).
 * - "Not available" is always `null` — never "", 0 or a placeholder. The UI renders null as "nicht verfügbar".
 * - Codes always come with their German display label (kindLabel, stateLabel, ...), so the frontend
 *   needs no copy of label tables.
 * - Every response is a JSON object. Errors are Nest's { statusCode, message, error } with German messages.
 * - Internal fields (confidence, normalizedName, fieldSources, status, internal notes) are never exposed.
 */

export type IsoDateTime = string;

export type GermanStateCode =
  | "DE-BW" | "DE-BY" | "DE-BE" | "DE-BB" | "DE-HB" | "DE-HH" | "DE-HE" | "DE-MV"
  | "DE-NI" | "DE-NW" | "DE-RP" | "DE-SL" | "DE-SN" | "DE-ST" | "DE-SH" | "DE-TH";

export type CompanyKindApi =
  | "HOUSING_COMPANY" | "MUNICIPAL_HOUSING" | "COOPERATIVE" | "PROPERTY_MANAGER"
  | "REAL_ESTATE_COMPANY" | "PRIVATE_LANDLORD" | "UNKNOWN";
export type VerificationStatusApi = "UNVERIFIED" | "AUTO_VERIFIED" | "MANUALLY_VERIFIED";
export type OperationalStatusApi = "OPERATING" | "DISSOLVED" | "UNKNOWN";
export type AliasTypeApi = "LEGAL_NAME" | "BRAND" | "FORMER_NAME" | "SHORT_NAME" | "SPELLING";
export type IdentifierSchemeApi = "LEI" | "WIKIDATA" | "GERMAN_REGISTER";
export type CompanyRelationTypeApi = "PARENT_OF" | "MANAGES_FOR" | "SUCCESSOR_OF";
export type LocationTypeApi = "HEADQUARTERS" | "BRANCH";
export type PropertyRoleApi = "OWNER" | "LANDLORD" | "MANAGER";

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------------------------
// Landlord card — GET /landlords, /search, /search/suggest results, relations, discovery results.
// ---------------------------------------------------------------------------------------------
export interface LandlordSummary {
  id: string;
  slug: string;
  name: string;
  kind: CompanyKindApi;
  /** German label; for kind UNKNOWN the UI shows "Unternehmensart: nicht verfügbar" instead. */
  kindLabel: string;
  /** Legacy field (free-text label of pre-existing rows); equals kindLabel for discovered records. */
  companyType: string;
  /** Headquarters city; null when unknown. */
  city: string | null;
  state: GermanStateCode | null;
  stateLabel: string | null;
  /** http/https only (validated server-side); null when unknown. */
  website: string | null;
  verificationStatus: VerificationStatusApi;
  /** German label, e.g. "Nicht geprüft", "Automatisch verifiziert", "Von WohnCheck geprüft". */
  verificationLabel: string;
  operationalStatus: OperationalStatusApi;
  /** null = no published reviews — must be rendered as "Noch keine Bewertungen", never as 0. */
  ratingOverall: number | null;
  reviewCount: number;
}

/** GET /landlords?limit=50&offset=0&kind=&state=&sort=   (limit max 200; only ACTIVE records) */
export type LandlordSort = "name" | "reviews" | "rating" | "recent";
export type LandlordListResponse = Paginated<LandlordSummary>;

export interface PropertyPartyView {
  role: PropertyRoleApi;
  /** "Eigentümer", "Vermieter", "Hausverwaltung" */
  roleLabel: string;
  landlord: LandlordRef;
}

/** GET /landlords/:id — legacy shape (properties array) + redirect info. */
export interface LandlordDetailResponse extends LandlordSummary {
  /** Set when :id was a MERGED record; the body describes the survivor. The frontend replaces the URL with `id`. */
  redirectedFromId: string | null;
  properties: Array<{
    id: string; street: string; houseNumber: string; postalCode: string; city: string;
    slug: string; landlordId: string; neighborhoodId: string | null;
  }>;
}

// ---------------------------------------------------------------------------------------------
// GET /landlords/:id/profile   (module companies)
// ---------------------------------------------------------------------------------------------
export interface LandlordRef {
  id: string;
  slug: string;
  name: string;
  kindLabel: string;
  city: string | null;
}

export interface LandlordProfileResponse {
  landlord: LandlordSummary & {
    legalName: string | null;
    /** Canonical code, e.g. "GMBH_CO_KG". */
    legalForm: string | null;
    /** e.g. "GmbH & Co. KG". */
    legalFormLabel: string | null;
    postalCode: string | null;
    operatingStates: Array<{ state: GermanStateCode; label: string }>;
    /** Fixed German sentence for records that no admin has checked, e.g. "Automatisch aus offenen Quellen erfasst, nicht redaktionell geprüft."; null for MANUALLY_VERIFIED. */
    verificationNotice: string | null;
    /** Last time any source confirmed the record; null for records without sources. */
    lastRefreshedAt: IsoDateTime | null;
  };
  redirectedFromId: string | null;
  aliases: Array<{ name: string; type: AliasTypeApi; typeLabel: string }>;
  identifiers: Array<{
    scheme: IdentifierSchemeApi;
    /** "LEI", "Wikidata", "Handelsregister" */
    schemeLabel: string;
    /** Human-readable form, e.g. "HRB 16879, Amtsgericht Bochum" when the court name is known, else the canonical value. */
    display: string;
    value: string;
    /** Public lookup links for manual verification (search.gleif.org, wikidata.org, opencorporates.com). */
    links: Array<{ label: string; url: string }>;
  }>;
  /** Only relations whose other side is ACTIVE. */
  relations: Array<{
    type: CompanyRelationTypeApi;
    /** "outgoing": this landlord <type> other; "incoming": other <type> this landlord. */
    direction: "outgoing" | "incoming";
    /** Direction-aware German label for the OTHER company, e.g. "Muttergesellschaft", "Tochtergesellschaft", "Verwaltet für", "Verwaltet durch", "Rechtsnachfolger", "Rechtsvorgänger". */
    label: string;
    other: LandlordRef;
    sourceKey: string;
  }>;
  locations: Array<{
    id: string;
    type: LocationTypeApi;
    name: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    state: GermanStateCode | null;
    sourceKey: string;
  }>;
  /** One entry per source (grouped). `attribution` MUST be rendered when present. */
  sources: Array<{
    sourceKey: string;
    displayName: string;
    license: string;
    licenseUrl: string | null;
    attribution: string | null;
    attributionUrl: string | null;
    /** e.g. staleness note for old register dumps. */
    note: string | null;
    recordCount: number;
    /** Up to 5 record URLs for provenance display. */
    recordUrls: string[];
    firstSeenAt: IsoDateTime;
    lastSeenAt: IsoDateTime;
  }>;
}

// ---------------------------------------------------------------------------------------------
// GET /landlords/:id/external   (module external) — only CONFIRMED and PROBABLE references are returned.
// No ratings, counts or texts of external platforms are ever part of this response.
// ---------------------------------------------------------------------------------------------
export interface ExternalLinkView {
  /** German link text, e.g. "Auf Trustpilot suchen". */
  label: string;
  url: string;
}

export interface ExternalReferenceView {
  id: string;
  type: "PROFILE" | "DISCUSSION";
  url: string;
  /** Generated or admin-written German label — never third-party text. */
  label: string;
  /** German topic labels an admin assigned to a discussion. */
  topicLabels: string[];
  matchStatus: "CONFIRMED" | "PROBABLE";
  /** Non-null exactly when matchStatus === "PROBABLE", e.g. "Zuordnung nicht abschließend geprüft". MUST be rendered. */
  matchHint: string | null;
  /** German description of how the link was established, e.g. "Angabe laut Wikidata", "Von WohnCheck geprüft". */
  originLabel: string;
  /** Office this reference belongs to (e.g. Google place of one branch). */
  location: { id: string; name: string | null; city: string | null } | null;
  verifiedAt: IsoDateTime | null;
}

export interface ExternalPlatformBlock {
  /** Provider key, e.g. "trustpilot", "google_maps", "reddit". */
  platform: string;
  displayName: string;
  /** All current providers are "link_only": WohnCheck shows links, never platform content. */
  mode: "link_only";
  /** German explanation why only links are available. */
  notice: string;
  references: ExternalReferenceView[];
  /** Generated at request time, never stored. */
  searchLinks: ExternalLinkView[];
}

export interface LandlordExternalResponse {
  landlordId: string;
  redirectedFromId: string | null;
  /** Fixed German text: external content is not checked by WohnCheck; no cross-platform ratings. MUST be rendered. */
  disclaimer: string;
  /** One block per registered provider, in registry order, even when it has no references. */
  platforms: ExternalPlatformBlock[];
  /** General help links (e.g. "Mieterverein finden"). */
  helpLinks: ExternalLinkView[];
}

/** POST /landlords/:id/reports  -> 201 CreateMappingReportResponse */
export type MappingReportKindApi =
  | "WRONG_EXTERNAL_LINK" | "WRONG_COMPANY_DATA" | "DUPLICATE" | "WRONG_RELATION"
  | "REMOVAL_REQUEST" | "REVIEW_COMPLAINT" | "OTHER";
export type ReporterRoleApi = "TENANT" | "COMPANY_REPRESENTATIVE" | "AFFECTED_PERSON" | "OTHER";
export interface CreateMappingReportRequest {
  kind: MappingReportKindApi;
  reporterRole?: ReporterRoleApi;
  /** 10..2000 characters. */
  message: string;
  externalReferenceId?: string;
  /** For kind REVIEW_COMPLAINT. */
  reviewId?: string;
  contactEmail?: string;
}
export interface CreateMappingReportResponse {
  id: string;
  status: "OPEN";
}

// ---------------------------------------------------------------------------------------------
// GET /landlords/:id/topics   (module topics) — own PUBLISHED reviews with targetType LANDLORD only.
// ---------------------------------------------------------------------------------------------
export type TopicKey =
  | "communication" | "deposit" | "utility_costs" | "rent_increase"
  | "repairs" | "complaints" | "handover" | "contract";
export type TopicStatementTypeApi = "EXPERIENCE" | "FACT_CLAIM" | "ALLEGATION";

export interface TopicExample {
  /** The frontend links to the review on the same page: #review-<reviewId>. */
  reviewId: string;
  /** Literal sentence(s) of OUR review that triggered the tag (max 300 chars). */
  excerpt: string;
  statementType: TopicStatementTypeApi;
  /** Describes the text, not the company: "Persönliche Erfahrung", "Konkrete Angabe des Verfassers (von WohnCheck nicht geprüft)", "Vorwurf des Verfassers (von WohnCheck nicht geprüft)". */
  statementTypeLabel: string;
  reviewCreatedAt: IsoDateTime;
}

export interface LandlordTopicsResponse {
  landlordId: string;
  redirectedFromId: string | null;
  /** e.g. "rules-v1". */
  analyzer: string;
  /** German one-liner how topics are detected (keyword rules, no AI judgement). */
  methodNote: string;
  /** Published reviews of this landlord that the analyzer has processed. */
  analyzedReviewCount: number;
  /** Fixed German text: statements are users' reports, not verified by WohnCheck. MUST be rendered. */
  disclaimer: string;
  /**
   * Only topics mentioned in at least one review; ordered by reviewCount desc.
   * `reviewCount` is a neutral mention count ("In N Bewertungen erwähnt") — no polarity, no aggregation by statement type.
   */
  topics: Array<{
    topic: TopicKey;
    label: string;
    reviewCount: number;
    /** Max 3, newest first. */
    examples: TopicExample[];
  }>;
}

// ---------------------------------------------------------------------------------------------
// GET /search?q=&kind=&state=   and   GET /search/suggest?q=   (module directory)
// q optional; fewer than 2 characters after folding -> 200 with empty lists (never 400).
// ---------------------------------------------------------------------------------------------
export interface LandlordSearchHit extends LandlordSummary {
  /** Set when the hit matched an alias instead of the display name ("auch bekannt als ..."). */
  matchedAlias: string | null;
}

export interface SearchPropertyHit {
  id: string; street: string; houseNumber: string; postalCode: string; city: string; slug: string;
  landlordId: string; neighborhoodId: string | null;
  /** null when the property's landlord is not public. */
  landlord: { id: string; name: string; slug: string } | null;
  ratingOverall: number | null; reviewCount: number;
}
export interface SearchNeighborhoodHit {
  id: string; districtName: string; city: string; postalCode: string; slug: string;
  ratingOverall: number | null; reviewCount: number;
}

export interface SearchResponse {
  /** Trimmed query as received. */
  query: string;
  /** Max 20, ACTIVE only, deduplicated by landlord id, best match first. Affected by kind/state filters. */
  landlords: LandlordSearchHit[];
  /** Max 10 each; not affected by kind/state filters. */
  properties: SearchPropertyHit[];
  neighborhoods: SearchNeighborhoodHit[];
  /**
   * True when the page may OFFER search-on-miss (a button — never automatic): no hit in any category,
   * no filters set, and the query passes the same company-name gate as POST /discovery/requests.
   */
  discoveryEligible: boolean;
}

export interface SuggestItem {
  type: "landlord" | "property" | "neighborhood";
  id: string;
  /** e.g. "Vonovia SE". */
  label: string;
  /** e.g. "Wohnungsgesellschaft · Bochum". */
  sublabel: string;
}
export interface SuggestResponse {
  query: string;
  /** Max 8. Empty for q shorter than 2 characters. Local database only — never triggers discovery. */
  suggestions: SuggestItem[];
}

// ---------------------------------------------------------------------------------------------
// GET /directory/stats   (module directory) — ACTIVE landlords only.
// ---------------------------------------------------------------------------------------------
export interface DirectoryStatsResponse {
  landlords: {
    total: number;
    /** AUTO_VERIFIED + MANUALLY_VERIFIED */
    verified: number;
    /** All kinds with count > 0; fills the kind filter. */
    byKind: Array<{ kind: CompanyKindApi; label: string; count: number }>;
    /** All 16 states (count may be 0), counted by operatingStates; fills the state filter. */
    byState: Array<{ state: GermanStateCode; label: string; count: number }>;
  };
  properties: number;
  neighborhoods: number;
  publishedReviews: number;
  generatedAt: IsoDateTime;
}

// ---------------------------------------------------------------------------------------------
// POST /discovery/requests   and   GET /discovery/requests/:id   (module discovery)
// POST answers 200 with the current state (new, running or cached); 400 when the query is not an
// acceptable company name; 429 when throttled. The query text is never part of a response.
// ---------------------------------------------------------------------------------------------
export interface CreateDiscoveryRequest {
  /** 3..80 characters; must look like a company name (no address, postcode, URL or e-mail). */
  query: string;
}

export type DiscoveryStatusApi =
  /** A local landlord already matches — no discovery was started. */
  | "NOT_NEEDED"
  | "PENDING" | "RUNNING" | "FOUND" | "NEEDS_REVIEW" | "NOT_FOUND" | "FAILED"
  /** Search-on-miss is switched off or no source is available. */
  | "UNAVAILABLE";

export interface DiscoveryRequestResponse {
  /** null for NOT_NEEDED and UNAVAILABLE (nothing was stored). */
  id: string | null;
  status: DiscoveryStatusApi;
  /** German user-facing text for the status. */
  message: string;
  /** ACTIVE landlords only; non-empty for FOUND and NOT_NEEDED. Candidate ids are never exposed. */
  landlords: LandlordSummary[];
  /** Suggested delay before the next GET; null when the status is terminal. */
  pollAfterMs: number | null;
  completedAt: IsoDateTime | null;
}
