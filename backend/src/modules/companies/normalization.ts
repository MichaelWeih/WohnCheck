import { CompanyKind, IdentifierScheme } from "@prisma/client";
import { DiscoveredIdentifier, LegalFormCode } from "./company.types";
import { LEGAL_FORM_LABELS, extractLegalForm } from "./legal-forms";
import { hasOnlyGenericTokens } from "./name-tokens";
import { isSharedDomain, MULTI_LABEL_PUBLIC_SUFFIXES } from "./shared-domains";

/**
 * Pure helpers for company identity (docs/vermieter-verzeichnis.md section 3.1). No I/O.
 * Bump NORMALIZATION_VERSION whenever the output of normalizeCompanyName changes: rows with an older
 * version are re-normalized on application bootstrap.
 */
export const NORMALIZATION_VERSION = 1;

export interface NormalizedName {
  /** Core name without legal form; "" when nothing is left. */
  normalized: string;
  legalForm: LegalFormCode | null;
  tokens: string[];
}

const UMLAUTS: Record<string, string> = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };

/**
 * Step 1 of the normalization: NFKC, lower case, umlauts transliterated, other diacritics removed.
 * Punctuation and "&" are kept, because the legal-form recognition needs them.
 */
export function foldText(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC");
}

/** Step 3: connectors become "und", punctuation and hyphens become blanks, white space collapsed. */
function tokenize(text: string): string[] {
  return text
    .replace(/&|\+|(?<![\p{L}\p{N}])u\.(?=\s)/gu, " und ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Core name without legal form; "" when nothing remains. */
export function normalizeCompanyName(raw: string): NormalizedName {
  const folded = foldText(raw ?? "");
  const { legalForm: extracted, rest } = extractLegalForm(folded);
  let tokens = tokenize(rest);
  let legalForm: LegalFormCode | null = extracted;

  // "Stiftung" is a legal form only as the LAST separate word of a name without another legal form
  // ("Schmidt Stiftung", "Schmidt-Stiftung"); never at the start or inside a word.
  if (!legalForm && tokens.length > 1 && tokens[tokens.length - 1] === "stiftung") {
    legalForm = "STIFTUNG";
    tokens = tokens.slice(0, -1);
  }

  return { normalized: tokens.join(" "), legalForm, tokens };
}

/** Same folding, without removing legal forms — for search text. */
export function normalizeSearchText(raw: string): string {
  return tokenize(foldText(raw ?? "")).join(" ");
}

/** "GmbH & Co. KG" etc.; null for unknown codes. */
export function legalFormLabel(code: LegalFormCode | null | undefined): string | null {
  return code ? (LEGAL_FORM_LABELS[code] ?? null) : null;
}

/** Only http/https, max. 500 characters, normalized (lower-case host, no fragment); otherwise null. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  url.hash = "";
  const href = url.href;
  return href.length <= 500 ? href : null;
}

/**
 * Registrable domain ("vonovia.de" for "https://www.vonovia.de/de-de/kontakt").
 * null for invalid URLs, IP addresses and shared / portal / site-builder domains.
 */
export function registrableDomain(url: string | null | undefined): string | null {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const host = new URL(safe).hostname.replace(/\.$/, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  const domain =
    MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo) && labels.length >= 3 ? labels.slice(-3).join(".") : lastTwo;
  return isSharedDomain(domain) ? null : domain;
}

const REGISTER_TYPES = new Set(["HRA", "HRB", "GnR", "PR", "VR", "GsR"]);

/** Canonical identifier, or null => the identifier is dropped (never stored). */
export function canonicalIdentifier(
  id: DiscoveredIdentifier,
): { scheme: IdentifierScheme; value: string } | null {
  if (id.scheme === "LEI") {
    const value = id.value.trim().toUpperCase();
    return /^[A-Z0-9]{18}\d{2}$/.test(value) ? { scheme: IdentifierScheme.LEI, value } : null;
  }
  if (id.scheme === "WIKIDATA") {
    const match = /^(?:https?:\/\/www\.wikidata\.org\/(?:wiki|entity)\/)?(Q[1-9]\d*)$/i.exec(id.value.trim());
    return match ? { scheme: IdentifierScheme.WIKIDATA, value: match[1].toUpperCase() } : null;
  }
  const court = id.courtCode?.trim().toUpperCase();
  const number = id.number?.replace(/\s+/g, "").toUpperCase();
  if (!court || !/^[A-Z]\d{4}$/.test(court) || !REGISTER_TYPES.has(id.registerType)) return null;
  if (!number || !/^\d{1,7}[A-Z]{0,2}$/.test(number)) return null;
  return { scheme: IdentifierScheme.GERMAN_REGISTER, value: `${court}_${id.registerType}${number}` };
}

/** URL slug from name and city plus a short part of the id, so it is unique without retries. */
export function slugifyCompany(name: string, city: string | null | undefined, id: string): string {
  const base = [name, city]
    .filter(Boolean)
    .map((part) => normalizeSearchText(part!))
    .join(" ")
    .replace(/\s+/g, "-")
    .slice(0, 70)
    .replace(/-+$/, "");
  const suffix = id.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase();
  return `${base || "vermieter"}-${suffix}`;
}

/** Normalized "postalCode|street|houseNumber"; null without postal code and street. */
export function addressKey(a: {
  postalCode?: string | null;
  street?: string | null;
  houseNumber?: string | null;
}): string | null {
  const postalCode = a.postalCode?.replace(/\s+/g, "") ?? "";
  const street = normalizeStreet(a.street);
  if (!postalCode && !street) return null;
  const houseNumber = (a.houseNumber ?? "").toLowerCase().replace(/\s+/g, "");
  return `${postalCode}|${street}|${houseNumber}`;
}

/** "Kaiser-Wilhelm-Str. 103" and "Kaiser Wilhelm Strasse" fold to the same street key. */
export function normalizeStreet(street: string | null | undefined): string {
  return normalizeSearchText(street ?? "")
    .replace(/\bstr\b/g, "strasse")
    .replace(/(\p{L})str$/u, "$1strasse")
    .replace(/(\p{L}) strasse\b/gu, "$1strasse")
    .replace(/\s+/g, "");
}

/** [a, b] with a < b by JavaScript string comparison (same order as the DB CHECK on MergeCandidate). */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const STRONG_KEYWORDS = [
  "wohnungsbaugenossenschaft", "wohnungsgenossenschaft", "baugenossenschaft", "wohnungsbaugesellschaft",
  "wohnungsgesellschaft", "wohnungsunternehmen", "wohnungsbau", "wohnbau", "wohnungsverein", "bauverein",
  "siedlungsgesellschaft", "siedlungswerk", "wohnstaetten", "wohnungswirtschaft", "hausverwaltung",
  "immobilienverwaltung", "wohnungsverwaltung", "mietverwaltung",
];
const WEAK_KEYWORDS = ["immobilien", "grundstueck", "liegenschaft", "wohnen", "wohnraum", "vermietung", "realestate"];

/** Relevance / kind from a REGISTERED name (strong and weak keywords, matched as token substrings). */
export function classifyByName(name: NormalizedName): {
  relevance: "confirmed" | "likely" | "unknown";
  kind?: CompanyKind;
} {
  const strong = name.tokens.some((token) => STRONG_KEYWORDS.some((keyword) => token.includes(keyword)));
  if (strong) {
    const joined = name.tokens.join(" ");
    if (joined.includes("genossenschaft") || joined.includes("bauverein") || name.legalForm === "EG")
      return { relevance: "confirmed", kind: CompanyKind.COOPERATIVE };
    if (name.tokens.some((token) => token.endsWith("verwaltung")))
      return { relevance: "confirmed", kind: CompanyKind.PROPERTY_MANAGER };
    return { relevance: "confirmed", kind: CompanyKind.HOUSING_COMPANY };
  }
  if (name.tokens.some((token) => WEAK_KEYWORDS.some((keyword) => token.includes(keyword))))
    return { relevance: "likely" };
  return { relevance: "unknown" };
}

/** Checks whether text looks like a company name (gate for search-on-miss). */
export function looksLikeCompanyQuery(
  raw: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  const text = (raw ?? "").trim();
  if (text.length < 3 || text.length > 80) return { ok: false, reason: "length" };
  if (/@|https?:|www\./i.test(text)) return { ok: false, reason: "url_or_email" };
  if (/\b\d{5}\b/.test(text)) return { ok: false, reason: "postal_code" };
  if (/\d+\s*[a-z]?\s*$/i.test(text) && /(strasse|straße|str\.|weg|platz|allee|ring|gasse|damm)\b/i.test(text))
    return { ok: false, reason: "address" };
  const normalized = normalizeCompanyName(text);
  if (normalized.normalized.length < 3) return { ok: false, reason: "too_short" };
  if (hasOnlyGenericTokens(normalized.tokens)) return { ok: false, reason: "generic" };
  return { ok: true, normalized: normalizeSearchText(text) };
}
