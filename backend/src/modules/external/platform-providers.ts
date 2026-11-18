import { hasOnlyGenericTokens } from "../companies/name-tokens";
import { normalizeCompanyName } from "../companies/normalization";
import { ExternalLink, ExternalPlatformProvider, ParsedReference, PlatformCompanyContext } from "./external.types";

/**
 * Link-only providers (docs/vermieter-verzeichnis.md sections 6 and 10). None of them makes a network request;
 * no rating, count, text or user name of a platform is ever fetched or stored.
 */

/** Company name for search links; short or generic names get the city added to avoid unrelated hits. */
function searchTerm(company: PlatformCompanyContext, withCity = false): string {
  const n = normalizeCompanyName(company.name);
  const ambiguous = company.name.length < 5 || hasOnlyGenericTokens(n.tokens);
  return `"${company.name}"${(withCity || ambiguous) && company.city ? ` ${company.city}` : ""}`;
}

function httpsUrl(raw: string, hosts: string[]): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ? url : null;
  } catch {
    return null;
  }
}

export class TrustpilotProvider implements ExternalPlatformProvider {
  readonly key = "trustpilot";
  readonly displayName = "Trustpilot";
  readonly notice =
    "Trustpilot erlaubt die Anzeige seiner Bewertungen nur mit einem Partnervertrag. WohnCheck verlinkt deshalb nur.";
  readonly supportedTypes = ["PROFILE"] as const;

  buildSearchLinks(company: PlatformCompanyContext): ExternalLink[] {
    return [
      {
        label: "Auf Trustpilot suchen",
        url: `https://de.trustpilot.com/search?query=${encodeURIComponent(searchTerm(company))}`,
      },
    ];
  }

  parseReferenceUrl(type: "PROFILE" | "DISCUSSION", raw: string): ParsedReference | null {
    if (type !== "PROFILE") return null;
    const url = httpsUrl(raw, ["trustpilot.com"]);
    const slug = url && /^\/review\/([a-z0-9.-]+\.[a-z]{2,})\/?$/i.exec(url.pathname)?.[1]?.toLowerCase();
    return slug ? this.referenceFromExternalId("PROFILE", slug) : null;
  }

  referenceFromExternalId(type: "PROFILE" | "DISCUSSION", externalId: string): ParsedReference | null {
    const slug = externalId.trim().toLowerCase();
    if (type !== "PROFILE" || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(slug)) return null;
    return { type, url: `https://de.trustpilot.com/review/${slug}`, externalId: slug };
  }

  describeReference(): string {
    return "Profil auf Trustpilot";
  }
}

export class GoogleMapsProvider implements ExternalPlatformProvider {
  readonly key = "google_maps";
  readonly displayName = "Google Maps";
  readonly notice =
    "Nach den Google-Maps-Bedingungen dürfen Bewertungen in einem Verzeichnis nicht angezeigt werden. WohnCheck verlinkt nur.";
  readonly supportedTypes = ["PROFILE"] as const;

  buildSearchLinks(company: PlatformCompanyContext): ExternalLink[] {
    return [
      {
        label: "Auf Google Maps suchen",
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${company.name}${company.city ? ` ${company.city}` : ""}`)}`,
      },
    ];
  }

  parseReferenceUrl(type: "PROFILE" | "DISCUSSION", raw: string): ParsedReference | null {
    if (type !== "PROFILE") return null;
    const url = httpsUrl(raw, ["google.com"]);
    const placeId = url?.searchParams.get("query_place_id");
    if (!placeId || !/^[A-Za-z0-9_-]{10,}$/.test(placeId)) return null;
    return {
      type,
      url: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeId}`,
      externalId: placeId,
    };
  }

  describeReference(): string {
    return "Eintrag auf Google Maps";
  }
}

const SUBREDDITS = ["wohnen", "LegaladviceGerman", "de", "Finanzen", "Immobilieninvestments"];

export class RedditProvider implements ExternalPlatformProvider {
  readonly key = "reddit";
  readonly displayName = "Reddit";
  readonly notice =
    "Reddit erlaubt die kommerzielle Nutzung von Inhalten nur mit Vertrag. WohnCheck zeigt keine Beiträge, sondern verlinkt die Suche.";
  readonly supportedTypes = ["DISCUSSION"] as const;

  buildSearchLinks(company: PlatformCompanyContext): ExternalLink[] {
    const q = encodeURIComponent(searchTerm(company));
    return [
      { label: "Auf Reddit suchen", url: `https://www.reddit.com/search/?q=${q}` },
      ...SUBREDDITS.slice(0, 2).map((sub) => ({
        label: `In r/${sub} suchen`,
        url: `https://www.reddit.com/r/${sub}/search/?q=${q}&restrict_sr=1`,
      })),
    ];
  }

  parseReferenceUrl(type: "PROFILE" | "DISCUSSION", raw: string): ParsedReference | null {
    if (type !== "DISCUSSION") return null;
    const url = httpsUrl(raw, ["reddit.com"]);
    const match = url && /^\/(?:r\/([A-Za-z0-9_]{2,21})\/)?comments\/([a-z0-9]{4,10})(?:\/|$)/.exec(url.pathname);
    if (!match) return null;
    return {
      type,
      url: `https://www.reddit.com/comments/${match[2]}`,
      externalId: match[2],
      evidence: match[1] ? { subreddit: match[1] } : undefined,
    };
  }

  describeReference(reference: { evidence: unknown }): string {
    const sub = (reference.evidence as { subreddit?: string } | null)?.subreddit;
    return sub ? `Diskussion auf Reddit (r/${sub})` : "Diskussion auf Reddit";
  }
}

export const PLATFORM_PROVIDERS: ExternalPlatformProvider[] = [
  new TrustpilotProvider(),
  new GoogleMapsProvider(),
  new RedditProvider(),
];
