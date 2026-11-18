import { Injectable } from "@nestjs/common";
import { OutboundHttpService } from "../../../common/http/outbound-http.types";
import { SOURCE_CATALOG } from "../../../common/sources/source-catalog";
import { DiscoveredAddress, DiscoveredCompany, DiscoveredIdentifier } from "../../companies/company.types";
import { DiscoveryPage, DiscoveryPageRequest, DiscoveryProvider } from "../discovery.types";
import { isSourceEnabled } from "../discovery.config";
import { registerFromOpenCorporates } from "./wikidata-landlord.provider";

/**
 * GLEIF LEI records (CC0, official API): registered name, legal form, seat, register number and LEI of
 * legal entities in Germany. Enumerated per housing keyword of the registered name (token match), page size 200.
 * Incremental runs only ask for records updated since the last completed run.
 *
 * Not used: sole proprietors (category SOLE_PROPRIETOR) and parent relations (one extra request per record;
 * Wikidata supplies parents for the well-known groups).
 */
export const GLEIF_SCOPES = [
  "Wohnungsbaugesellschaft",
  "Wohnungsgesellschaft",
  "Wohnungsbaugenossenschaft",
  "Wohnungsgenossenschaft",
  "Baugenossenschaft",
  "Wohnungsunternehmen",
  "Wohnungsbau",
  "Wohnbau",
  "Hausverwaltung",
  "Immobilienverwaltung",
  "Wohnungsverwaltung",
];
const BASE = "https://api.gleif.org/api/v1";
const PAGE_SIZE = 200;

interface GleifAddress {
  addressLines?: string[];
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
}
export interface GleifRecord {
  id: string;
  attributes?: {
    lei?: string;
    ocid?: string | null;
    entity?: {
      legalName?: { name?: string };
      otherNames?: Array<{ name?: string }>;
      category?: string | null;
      status?: string | null;
      legalAddress?: GleifAddress;
      headquartersAddress?: GleifAddress;
    };
    registration?: { lastUpdateDate?: string };
  };
}
interface GleifList {
  data?: GleifRecord[];
  meta?: { pagination?: { currentPage?: number; lastPage?: number; total?: number } };
}

/** "Universitätsstraße 133" -> street + house number; anything unusual stays as street only. */
export function splitAddressLine(line: string | undefined): { street?: string; houseNumber?: string } {
  const value = line?.trim();
  if (!value) return {};
  const match = /^(.*\D)\s+(\d+[a-zA-Z]?(?:\s*[-/]\s*\d+[a-zA-Z]?)?)$/.exec(value);
  return match ? { street: match[1].trim().replace(/,$/, ""), houseNumber: match[2].replace(/\s+/g, "") } : { street: value };
}

function address(a: GleifAddress | undefined): DiscoveredAddress | undefined {
  if (!a) return undefined;
  return {
    ...splitAddressLine(a.addressLines?.[0]),
    postalCode: a.postalCode?.trim() || undefined,
    city: a.city?.trim() || undefined,
    state: a.region?.trim() || undefined,
    country: a.country?.trim().toUpperCase() || undefined,
  };
}

export function mapGleifRecord(record: GleifRecord, fetchedAt: Date): DiscoveredCompany | null {
  const entity = record.attributes?.entity;
  const lei = record.attributes?.lei ?? record.id;
  const name = entity?.legalName?.name?.trim();
  if (!lei || !name || !entity) return null;
  if (entity.category === "SOLE_PROPRIETOR") return null;
  const identifiers: DiscoveredIdentifier[] = [{ scheme: "LEI", value: lei }];
  const register = registerFromOpenCorporates(record.attributes?.ocid ?? undefined);
  if (register) identifiers.push(register);
  const hq = address(entity.headquartersAddress) ?? address(entity.legalAddress);
  return {
    sourceKey: "gleif",
    externalId: lei,
    sourceUrl: `https://search.gleif.org/#/record/${lei}`,
    license: SOURCE_CATALOG.gleif.license,
    recordKind: "entity",
    name,
    nameIsRegistered: true,
    aliases: (entity.otherNames ?? []).map((n) => ({ name: n.name?.trim() ?? "" })).filter((n) => n.name),
    // GLEIF registers legal entities; the resolver still requires a collectable legal form in the name.
    entityNature: entity.category === "GENERAL" || entity.category === "FUND" ? "legal_entity" : "unknown",
    relevance: "unknown", // decided by the resolver from the registered name
    identifiers,
    headquarters: hq,
    entityStatus: entity.status === "INACTIVE" ? "inactive" : "active",
    fetchedAt,
  };
}

@Injectable()
export class GleifLandlordProvider implements DiscoveryProvider {
  readonly key = "gleif";

  constructor(private readonly http: OutboundHttpService) {}

  isEnabled(): boolean {
    return isSourceEnabled(this.key);
  }

  disabledReason(): string | null {
    return this.isEnabled() ? null : "GLEIF ist in DISCOVERY_SOURCES nicht freigeschaltet.";
  }

  listScopes(): string[] {
    return GLEIF_SCOPES;
  }

  private async list(params: Record<string, string>, signal: AbortSignal): Promise<GleifList> {
    this.http.registerHost({ host: "api.gleif.org", minIntervalMs: 1_000, dailyBudget: 5_000 });
    const url = new URL(`${BASE}/lei-records`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.http.getJson<GleifList>(url.href, {
      headers: { Accept: "application/vnd.api+json" },
      timeoutMs: 30_000,
      retries: 1,
      maxResponseBytes: 20_000_000,
      signal,
    });
    if (!Array.isArray(response.data)) throw new Error("Invalid GLEIF response");
    return response;
  }

  async fetchPage(request: DiscoveryPageRequest, signal: AbortSignal): Promise<DiscoveryPage> {
    if (!GLEIF_SCOPES.includes(request.scope)) throw new Error(`Unknown GLEIF scope "${request.scope}"`);
    const page = typeof request.cursor === "number" ? request.cursor : 1;
    const params: Record<string, string> = {
      "filter[entity.legalName]": request.scope,
      "filter[entity.legalAddress.country]": "DE",
      "page[size]": String(PAGE_SIZE),
      "page[number]": String(page),
      sort: "lei",
    };
    if (request.mode === "INCREMENTAL" && typeof request.watermark === "string")
      params["filter[registration.lastUpdateDate]"] = `>=${request.watermark.slice(0, 10)}`;
    const response = await this.list(params, signal);
    const fetchedAt = new Date();
    const records = response.data!.map((r) => mapGleifRecord(r, fetchedAt)).filter((r): r is DiscoveredCompany => r !== null);
    const lastPage = response.meta?.pagination?.lastPage ?? page;
    const done = response.data!.length < PAGE_SIZE || page >= lastPage || page * PAGE_SIZE >= 10_000;
    return { records, nextCursor: done ? null : page + 1, done, watermark: done ? request.runStartedAt.toISOString() : undefined };
  }

  async searchByName(query: string, signal: AbortSignal): Promise<DiscoveredCompany[]> {
    const response = await this.list(
      {
        "filter[entity.legalName]": query,
        "filter[entity.legalAddress.country]": "DE",
        "page[size]": "10",
      },
      signal,
    );
    const fetchedAt = new Date();
    return response.data!.map((r) => mapGleifRecord(r, fetchedAt)).filter((r): r is DiscoveredCompany => r !== null);
  }
}
