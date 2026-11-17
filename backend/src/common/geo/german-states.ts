/**
 * German federal states as ISO 3166-2 codes. This is the single source of truth for
 * `Landlord.state`, `Landlord.operatingStates`, `LandlordLocation.state` and the regional search filter.
 */
export const GERMAN_STATES = {
  "DE-BW": "Baden-Württemberg",
  "DE-BY": "Bayern",
  "DE-BE": "Berlin",
  "DE-BB": "Brandenburg",
  "DE-HB": "Bremen",
  "DE-HH": "Hamburg",
  "DE-HE": "Hessen",
  "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Niedersachsen",
  "DE-NW": "Nordrhein-Westfalen",
  "DE-RP": "Rheinland-Pfalz",
  "DE-SL": "Saarland",
  "DE-SN": "Sachsen",
  "DE-ST": "Sachsen-Anhalt",
  "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thüringen",
} as const;

export type GermanStateCode = keyof typeof GERMAN_STATES;

export const GERMAN_STATE_CODES = Object.keys(GERMAN_STATES) as GermanStateCode[];

export function isGermanStateCode(value: unknown): value is GermanStateCode {
  return typeof value === "string" && value in GERMAN_STATES;
}

const NAME_TO_CODE = new Map<string, GermanStateCode>();

function foldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");
}

for (const [code, name] of Object.entries(GERMAN_STATES) as Array<[GermanStateCode, string]>) {
  NAME_TO_CODE.set(foldName(name), code);
}

// English and other common variants used by data sources.
const VARIANTS: Record<string, GermanStateCode> = {
  bavaria: "DE-BY",
  hesse: "DE-HE",
  lowersaxony: "DE-NI",
  northrhinewestphalia: "DE-NW",
  rhinelandpalatinate: "DE-RP",
  saxony: "DE-SN",
  saxonyanhalt: "DE-ST",
  thuringia: "DE-TH",
  mecklenburgwesternpomerania: "DE-MV",
  freistaatbayern: "DE-BY",
  freistaatsachsen: "DE-SN",
  freistaatthueringen: "DE-TH",
  freieundhansestadthamburg: "DE-HH",
  freiehansestadtbremen: "DE-HB",
  landberlin: "DE-BE",
};

for (const [name, code] of Object.entries(VARIANTS)) {
  NAME_TO_CODE.set(name, code);
}

/**
 * Maps whatever a source calls a federal state to its ISO 3166-2 code:
 * accepts "DE-BE", "BE" and German/English state names. Returns undefined when unknown —
 * callers must then leave the state empty instead of guessing.
 */
export function toGermanStateCode(value: string | null | undefined): GermanStateCode | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();

  if (isGermanStateCode(upper)) return upper;
  if (isGermanStateCode(`DE-${upper}`)) return `DE-${upper}` as GermanStateCode;

  return NAME_TO_CODE.get(foldName(trimmed));
}

export function germanStateLabel(code: string | null | undefined): string | undefined {
  return isGermanStateCode(code) ? GERMAN_STATES[code] : undefined;
}
