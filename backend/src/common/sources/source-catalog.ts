/**
 * Static metadata of every data source that can contribute to a landlord record.
 * Single source of truth for licence, attribution and field priority — imported by companies
 * (provenance display, overwrite rules) AND discovery (providers), so neither depends on the other for it.
 *
 * Adding a source = one entry here + one DiscoveryProvider.
 */
export interface SourceCatalogEntry {
  key: string;
  /** Name shown to users and admins. */
  displayName: string;
  /** SPDX-style licence id. */
  license: string;
  licenseUrl?: string;
  /** Attribution that MUST be shown wherever data of this source is displayed; undefined if none is required. */
  attribution?: string;
  attributionUrl?: string;
  /**
   * Field priority: a source may overwrite a landlord field that was set by itself or by a source
   * with a LOWER priority. "manual" (admin edit) is never overwritten by any source.
   */
  priority: number;
  /** True when anyone can edit the source (vandalism / self-promotion risk). */
  publiclyEditable: boolean;
  /** URL of a record in the source, for provenance links. `{id}` is replaced by the external id. */
  recordUrlTemplate?: string;
  /** Short German note shown next to data of this source, e.g. about staleness. */
  note?: string;
}

export const SOURCE_PRIORITY_MANUAL = 100;
export const SOURCE_PRIORITY_LEGACY = 10;

export const SOURCE_CATALOG = {
  gleif: {
    key: "gleif",
    displayName: "GLEIF (Global Legal Entity Identifier Foundation)",
    license: "CC0-1.0",
    licenseUrl: "https://www.gleif.org/en/meta/lei-data-terms-of-use",
    priority: 80,
    publiclyEditable: false,
    recordUrlTemplate: "https://search.gleif.org/#/record/{id}",
  },
  wikidata: {
    key: "wikidata",
    displayName: "Wikidata",
    license: "CC0-1.0",
    licenseUrl: "https://www.wikidata.org/wiki/Wikidata:Licensing",
    priority: 60,
    publiclyEditable: true,
    recordUrlTemplate: "https://www.wikidata.org/wiki/{id}",
  },
  osm: {
    key: "osm",
    displayName: "OpenStreetMap",
    license: "ODbL-1.0",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    attribution: "© OpenStreetMap-Mitwirkende, Open Database License (ODbL)",
    attributionUrl: "https://www.openstreetmap.org/copyright",
    priority: 40,
    publiclyEditable: true,
    recordUrlTemplate: "https://www.openstreetmap.org/{id}",
  },
  offeneregister: {
    key: "offeneregister",
    displayName: "OffeneRegister.de (OpenCorporates / Open Knowledge Foundation)",
    license: "CC-BY-4.0",
    licenseUrl: "https://offeneregister.de/daten/",
    attribution: "Registerdaten: OffeneRegister.de / OpenCorporates, CC BY 4.0",
    attributionUrl: "https://offeneregister.de/",
    priority: 30,
    publiclyEditable: false,
    recordUrlTemplate: "https://opencorporates.com/companies/de/{id}",
    note: "Registerstand 2018/2019 – Angaben können veraltet sein.",
  },
} as const satisfies Record<string, SourceCatalogEntry>;

export type SourceKey = keyof typeof SOURCE_CATALOG;

export function getSourceEntry(key: string): SourceCatalogEntry | undefined {
  return (SOURCE_CATALOG as Record<string, SourceCatalogEntry>)[key];
}

/** Priority used by the field-overwrite rule. Unknown keys rank like legacy data. */
export function sourcePriority(key: string | null | undefined): number {
  if (key === "manual") return SOURCE_PRIORITY_MANUAL;
  if (!key) return SOURCE_PRIORITY_LEGACY;
  return getSourceEntry(key)?.priority ?? SOURCE_PRIORITY_LEGACY;
}

export function sourceRecordUrl(key: string, externalId: string): string | undefined {
  const template = getSourceEntry(key)?.recordUrlTemplate;
  return template ? template.replace("{id}", externalId) : undefined;
}
