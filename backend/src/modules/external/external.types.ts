/**
 * CONTRACT for external experience platforms (Trustpilot, Google Maps, Reddit, ...).
 * Adding a platform = one class implementing `ExternalPlatformProvider`, registered in ExternalModule.
 * Neither the data model (ExternalReference.platform is a free string key) nor the frontend
 * (which renders whatever GET /landlords/:id/external returns) needs to change.
 *
 * All current providers are LINK-ONLY. The legal review (docs/vermieter-verzeichnis.md section 10) found
 * no platform whose terms allow WohnCheck to fetch, store or display its ratings or review texts without
 * a separate contract. Therefore:
 * - Providers make NO network requests at all. They only build and validate URLs.
 * - Nothing of a platform's content (titles, texts, ratings, counts, user names) is ever stored.
 * - What IS stored: a canonical URL / id of a profile or discussion, how the link was established,
 *   and its verification status.
 * If a contract later permits API use, a provider can gain optional methods — the stored model stays the same.
 */
export interface ExternalPlatformProvider {
  /** Platform key stored in ExternalReference.platform, e.g. "trustpilot". */
  readonly key: string;
  /** Display name, e.g. "Trustpilot". */
  readonly displayName: string;
  /** German explanation shown to users why only links are available. */
  readonly notice: string;
  /** Reference types an admin may add manually for this platform. */
  readonly supportedTypes: ReadonlyArray<"PROFILE" | "DISCUSSION">;

  /**
   * Plain outbound links a user can follow to look for this landlord on the platform (search pages).
   * Generated at request time, never stored. Company names go into the URL quoted / URL-encoded.
   */
  buildSearchLinks(company: PlatformCompanyContext): ExternalLink[];

  /**
   * Validates and canonicalises a URL (pasted by an admin or built from a source's id) for storage:
   * https only, host must belong to the platform (allow-list), tracking parameters / title slugs removed,
   * user-profile URLs rejected. Returns null when the URL is not an acceptable reference for `type`.
   * Only the returned canonical URL / externalId may be stored.
   */
  parseReferenceUrl(type: "PROFILE" | "DISCUSSION", url: string): ParsedReference | null;

  /** Builds the canonical reference from an id stated by a data source (e.g. Wikidata P5161 slug). */
  referenceFromExternalId?(type: "PROFILE" | "DISCUSSION", externalId: string): ParsedReference | null;

  /**
   * Suggestions for the ADMIN queue derived without network access (e.g. Trustpilot profile URL built from
   * the website domain). Always stored as UNVERIFIED — it is unknown whether the profile exists — and therefore
   * never public until an admin confirms it.
   */
  deriveProfileSuggestions?(company: PlatformCompanyContext): ParsedReference[];

  /**
   * German label shown publicly for a stored reference. Must be generated from our own data only
   * (e.g. "Profil auf Trustpilot", "Diskussion auf Reddit (r/wohnen)") — never third-party text.
   */
  describeReference(reference: { type: "PROFILE" | "DISCUSSION"; externalId: string | null; url: string; evidence: unknown }): string;
}

/** What a provider may know about a landlord. */
export interface PlatformCompanyContext {
  landlordId: string;
  name: string;
  legalName: string | null;
  /** Alias display names (brands, short names, former names). */
  aliases: string[];
  city: string | null;
  postalCode: string | null;
  website: string | null;
  /** Registrable domain; null for shared / portal domains. */
  websiteDomain: string | null;
}

export interface ExternalLink {
  /** German link text, e.g. "Auf Trustpilot suchen". */
  label: string;
  url: string;
}

export interface ParsedReference {
  type: "PROFILE" | "DISCUSSION";
  /** Canonical https URL. */
  url: string;
  /** Stable id on the platform if the URL contains one. */
  externalId: string | null;
  /** Small, non-personal facts parsed from the URL itself (e.g. { subreddit: "wohnen" }). */
  evidence?: Record<string, string>;
}

/** Job types owned by the external module. */
export const EXTERNAL_JOBS = {
  /**
   * payload: { landlordId: string } — network-free: turns external ids stated by the landlord's source records
   * into ExternalReference rows and stores derived profile suggestions (UNVERIFIED). Enqueued by the resolver
   * with dedupeKey `external.link-landlord:<landlordId>` and rerunIfRunning.
   */
  LINK_LANDLORD: "external.link-landlord",
  /** payload: {} — flags references whose last verification is older than EXTERNAL_RECHECK_DAYS for manual re-check. Local only. */
  REVIEW_DUE: "external.review-due",
} as const;

export function linkLandlordDedupeKey(landlordId: string): string {
  return `external.link-landlord:${landlordId}`;
}
