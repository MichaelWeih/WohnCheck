import { Injectable } from "@nestjs/common";
import { CompanyKind, CompanyRelationType } from "@prisma/client";
import { OutboundHttpService } from "../../../common/http/outbound-http.types";
import { SOURCE_CATALOG } from "../../../common/sources/source-catalog";
import { DiscoveredCompany, DiscoveredIdentifier } from "../../companies/company.types";
import { DiscoveryPage, DiscoveryPageRequest, DiscoveryProvider } from "../discovery.types";
import { isSourceEnabled } from "../discovery.config";

/**
 * Wikidata (CC0): well-known housing companies, municipal companies and cooperatives with aliases, website,
 * headquarters, LEI, register number (P1320) and parent company. Queries follow
 * docs/quellenrecherche-2026-11-15.json (no wikibase:label service, no mwapi).
 *
 * Classes stated by Wikidata decide the relevance: housing company, housing cooperative, building cooperative and
 * property management are "confirmed"; real-estate company and the housing / real-estate industries only "likely"
 * (such records stay CANDIDATE until a second source or an admin confirms them).
 */
export const WIKIDATA_STRONG_CLASSES: Record<string, CompanyKind> = {
  Q562166: CompanyKind.COOPERATIVE, // housing cooperative
  Q4986589: CompanyKind.COOPERATIVE, // building cooperative
  Q1534992: CompanyKind.HOUSING_COMPANY, // housing company
  Q1618728: CompanyKind.PROPERTY_MANAGER, // property management
};
const WEAK_CLASSES = ["Q1660104"]; // real estate company
const INDUSTRIES = ["Q1660132", "Q2588161", "Q1618728", "Q58081477", "Q1534992"];
const PAGE_SIZE = 200;
const SPARQL_DEFAULT = "https://query.wikidata.org/sparql";
const ACTION_API = "https://www.wikidata.org/w/api.php";

interface Binding {
  [key: string]: { value: string } | undefined;
}
interface SparqlResponse {
  results?: { bindings?: Binding[] };
}

const values = (ids: string[]) => ids.map((id) => `wd:${id}`).join(" ");
const split = (value: string | undefined) => (value ? value.split("|").map((v) => v.trim()).filter(Boolean) : []);

function itemSelection(inner: string): string {
  // The class / industry / country gate is applied in the inner selection; everything else is OPTIONAL.
  return `
SELECT ?item ?labelDe ?labelEn
  (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
  (GROUP_CONCAT(DISTINCT STR(?web); separator="|") AS ?websites)
  (GROUP_CONCAT(DISTINCT ?hqName; separator="|") AS ?hqCities)
  (GROUP_CONCAT(DISTINCT ?parentId; separator="|") AS ?parentIds)
  (GROUP_CONCAT(DISTINCT ?strongId; separator="|") AS ?strongClasses)
  (SAMPLE(?lei_) AS ?lei) (SAMPLE(?oc_) AS ?openCorporates) (SAMPLE(?tp_) AS ?trustpilot)
  (SAMPLE(?end_) AS ?dissolved)
WHERE {
  ${inner}
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }
  OPTIONAL { ?item rdfs:label ?labelDe . FILTER(LANG(?labelDe) = "de") }
  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "de") }
  OPTIONAL { ?item wdt:P856 ?web }
  OPTIONAL { ?item wdt:P159 ?hq . ?hq wdt:P31/wdt:P279* ?hqClass . VALUES ?hqClass { wd:Q262166 wd:Q515 }
             ?hq rdfs:label ?hqName . FILTER(LANG(?hqName) = "de") }
  OPTIONAL { ?item wdt:P749 ?parent . BIND(STRAFTER(STR(?parent), "/entity/") AS ?parentId) }
  OPTIONAL { VALUES ?strong { ${values(Object.keys(WIKIDATA_STRONG_CLASSES))} }
             ?item wdt:P31/wdt:P279* ?strong . BIND(STRAFTER(STR(?strong), "/entity/") AS ?strongId) }
  OPTIONAL { ?item wdt:P1278 ?lei_ }
  OPTIONAL { ?item wdt:P1320 ?oc_ }
  OPTIONAL { ?item wdt:P5161 ?tp_ }
  OPTIONAL { ?item wdt:P576 ?end_ }
}
GROUP BY ?item ?labelDe ?labelEn
ORDER BY ?item`;
}

const GATE = `
  { VALUES ?cls { ${values([...Object.keys(WIKIDATA_STRONG_CLASSES), ...WEAK_CLASSES])} } ?item wdt:P31/wdt:P279* ?cls . }
  UNION
  { VALUES ?ind { ${values(INDUSTRIES)} } ?item wdt:P452 ?ind . }
  { ?item wdt:P17 wd:Q183 } UNION { ?item wdt:P159/wdt:P17 wd:Q183 }`;

/** OpenCorporates id "de/R2201_HRB16879" -> register identifier with court code. */
export function registerFromOpenCorporates(value: string | undefined): DiscoveredIdentifier | null {
  const match = /^de\/([A-Z]\d{4})_(HRA|HRB|GnR|PR|VR|GsR)(\d{1,7}[A-Z]{0,2})$/.exec(value?.trim() ?? "");
  return match
    ? { scheme: "GERMAN_REGISTER", courtCode: match[1], registerType: match[2] as "HRB", number: match[3] }
    : null;
}

/** Maps one SPARQL row to a DiscoveredCompany; null for rows without a usable name. */
export function mapWikidataBinding(row: Binding, fetchedAt: Date): DiscoveredCompany | null {
  const qid = row.item?.value.split("/").pop();
  const name = row.labelDe?.value?.trim() || row.labelEn?.value?.trim();
  if (!qid || !/^Q\d+$/.test(qid) || !name) return null;
  const strong = split(row.strongClasses?.value).filter((id) => id in WIKIDATA_STRONG_CLASSES);
  const identifiers: DiscoveredIdentifier[] = [{ scheme: "WIKIDATA", value: qid }];
  if (row.lei?.value) identifiers.push({ scheme: "LEI", value: row.lei.value });
  const register = registerFromOpenCorporates(row.openCorporates?.value);
  if (register) identifiers.push(register);
  const cities = split(row.hqCities?.value);
  const websites = split(row.websites?.value);
  const aliases = split(row.aliases?.value)
    .filter((alias) => alias !== name)
    .slice(0, 20)
    .map((alias) => ({ name: alias }));
  return {
    sourceKey: "wikidata",
    externalId: qid,
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
    license: SOURCE_CATALOG.wikidata.license,
    recordKind: "entity",
    name,
    aliases,
    entityNature: "legal_entity",
    kind: strong.length ? WIKIDATA_STRONG_CLASSES[strong[0]] : undefined,
    relevance: strong.length ? "confirmed" : "likely",
    // Several websites are ambiguous: none is taken rather than a guessed one.
    website: websites.length === 1 ? websites[0] : undefined,
    identifiers,
    // Only a single, municipality-typed headquarters is taken over (P159 can also be a building or a district).
    headquarters: cities.length === 1 ? { city: cities[0], country: "DE" } : undefined,
    relations: split(row.parentIds?.value)
      .filter((id) => /^Q\d+$/.test(id))
      .map((id) => ({
        type: CompanyRelationType.PARENT_OF,
        direction: "incoming" as const,
        other: { identifier: { scheme: "WIKIDATA" as const, value: id }, sourceRef: { sourceKey: "wikidata", externalId: id } },
      })),
    externalReferences: row.trustpilot?.value
      ? [{ platform: "trustpilot", type: "PROFILE", externalId: row.trustpilot.value }]
      : undefined,
    entityStatus: row.dissolved?.value ? "inactive" : "active",
    fetchedAt,
  };
}

@Injectable()
export class WikidataLandlordProvider implements DiscoveryProvider {
  readonly key = "wikidata";

  constructor(private readonly http: OutboundHttpService) {}

  isEnabled(): boolean {
    return isSourceEnabled(this.key);
  }

  disabledReason(): string | null {
    return this.isEnabled() ? null : "Wikidata ist in DISCOVERY_SOURCES nicht freigeschaltet.";
  }

  listScopes(): string[] {
    return ["default"];
  }

  private sparqlUrl(): URL {
    return new URL(process.env.WIKIDATA_SPARQL_URL?.trim() || SPARQL_DEFAULT);
  }

  private register(url: URL) {
    this.http.registerHost({ host: url.hostname, minIntervalMs: 1_000, dailyBudget: 2_000 });
  }

  private async sparql(query: string, signal: AbortSignal): Promise<Binding[]> {
    const url = this.sparqlUrl();
    this.register(url);
    url.searchParams.set("query", query);
    const response = await this.http.getJson<SparqlResponse>(url.href, {
      headers: { Accept: "application/sparql-results+json" },
      timeoutMs: 60_000,
      retries: 1,
      maxResponseBytes: 20_000_000,
      signal,
    });
    if (!Array.isArray(response.results?.bindings)) throw new Error("Invalid SPARQL response");
    return response.results!.bindings!;
  }

  async fetchPage(request: DiscoveryPageRequest, signal: AbortSignal): Promise<DiscoveryPage> {
    const offset = typeof request.cursor === "number" ? request.cursor : 0;
    const inner = `{ SELECT DISTINCT ?item WHERE { ${GATE} } ORDER BY ?item LIMIT ${PAGE_SIZE} OFFSET ${offset} }`;
    const rows = await this.sparql(itemSelection(inner), signal);
    const fetchedAt = new Date();
    const records = rows.map((row) => mapWikidataBinding(row, fetchedAt)).filter((r): r is DiscoveredCompany => r !== null);
    // The inner selection returns at most PAGE_SIZE items; fewer means the enumeration is complete.
    const itemCount = new Set(rows.map((row) => row.item?.value)).size;
    const done = itemCount < PAGE_SIZE;
    return { records, nextCursor: done ? null : offset + PAGE_SIZE, done };
  }

  /** Action API search restricted to Germany, then the same mapping for the hits that belong to our classes. */
  async searchByName(query: string, signal: AbortSignal): Promise<DiscoveredCompany[]> {
    const api = new URL(ACTION_API);
    this.register(api);
    api.search = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: `${query} haswbstatement:P17=Q183`,
      srlimit: "10",
      srnamespace: "0",
      format: "json",
      maxlag: "5",
    }).toString();
    const search = await this.http.getJson<{ query?: { search?: Array<{ title: string }> } }>(api.href, {
      timeoutMs: 15_000,
      retries: 1,
      signal,
    });
    if (!Array.isArray(search.query?.search)) throw new Error("Invalid Wikidata search response");
    const qids = search.query!.search!.map((hit) => hit.title).filter((title) => /^Q\d+$/.test(title));
    if (!qids.length) return [];
    const inner = `{ SELECT DISTINCT ?item WHERE { VALUES ?item { ${values(qids)} } ${GATE} } }`;
    const rows = await this.sparql(itemSelection(inner), signal);
    const fetchedAt = new Date();
    return rows.map((row) => mapWikidataBinding(row, fetchedAt)).filter((r): r is DiscoveredCompany => r !== null).slice(0, 10);
  }
}
