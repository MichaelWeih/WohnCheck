export const PLACE_GROUPS = {
  transit: "ÖPNV",
  shopping: "Einkaufen",
  health: "Gesundheit",
  education: "Bildung",
  leisure: "Freizeit",
  food: "Gastronomie",
  infrastructure: "Infrastruktur",
} as const;
export type PlaceCategory = keyof typeof PLACE_GROUPS;
export const PLACE_KINDS = {
  bus: ["transit", "Bus"],
  tram: ["transit", "Tram"],
  subway: ["transit", "U-Bahn"],
  suburban: ["transit", "S-/Stadtbahn"],
  station: ["transit", "Bahnhof"],
  ferry: ["transit", "Fähre"],
  stop: ["transit", "Haltestelle (Verkehrsmittel nicht angegeben)"],
  supermarket: ["shopping", "Supermarkt / Discounter"],
  convenience: ["shopping", "Nahversorgung"],
  drugstore: ["shopping", "Drogerie"],
  bakery: ["shopping", "Bäckerei"],
  pharmacy: ["health", "Apotheke"],
  mall: ["shopping", "Einkaufszentrum"],
  market: ["shopping", "Wochenmarkt"],
  doctor: ["health", "Arzt"],
  general: ["health", "Hausarzt"],
  dentist: ["health", "Zahnarzt"],
  hospital: ["health", "Krankenhaus"],
  clinic: ["health", "Klinik"],
  veterinary: ["health", "Tierarzt"],
  childcare: ["education", "Kita / Kindergarten"],
  school: ["education", "Schule"],
  primary: ["education", "Grundschule"],
  secondary: ["education", "Weiterführende Schule"],
  university: ["education", "Hochschule"],
  library: ["education", "Bibliothek"],
  park: ["leisure", "Park / Grünfläche"],
  fitness: ["leisure", "Fitnessstudio"],
  sport: ["leisure", "Sportplatz / Verein"],
  swimming: ["leisure", "Schwimmbad"],
  cinema: ["leisure", "Kino"],
  theatre: ["leisure", "Theater"],
  museum: ["leisure", "Museum"],
  playground: ["leisure", "Spielplatz"],
  restaurant: ["food", "Restaurant"],
  cafe: ["food", "Café"],
  bar: ["food", "Bar"],
  fastfood: ["food", "Imbiss / Fast Food"],
  bank: ["infrastructure", "Bank"],
  atm: ["infrastructure", "Geldautomat"],
  post: ["infrastructure", "Post"],
  parcel: ["infrastructure", "Paketstation"],
  fuel: ["infrastructure", "Tankstelle"],
  charging: ["infrastructure", "Ladepunkt"],
  government: ["infrastructure", "Behörde"],
  police: ["infrastructure", "Polizei"],
  fire: ["infrastructure", "Feuerwehr"],
} as const;
export type PlaceKind = keyof typeof PLACE_KINDS;
/** How precisely the provider located the address. "street"/"area" mean: no confirmed house number. */
export type AddressAccuracy = "building" | "street" | "area";
export interface ResolvedAddress {
  id: string;
  label: string;
  shortLabel: string;
  latitude: number;
  longitude: number;
  street?: string;
  /** Only set when the provider confirmed the house number; never copied from the user input. */
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  district?: string;
  country?: string;
  countryCode?: string;
  accuracy: AddressAccuracy;
  /** Provider-reported match quality from 0 to 1; missing when the provider gave none. */
  confidence?: number;
}
export interface Place {
  /** Stable provider/OSM id, e.g. "osm:node:123". */
  id: string;
  name: string;
  categories: PlaceCategory[];
  kinds: PlaceKind[];
  latitude: number;
  longitude: number;
  /** Great-circle distance (Luftlinie) from the checked address, computed server-side. */
  distanceMeters: number;
  address?: string;
  openingHours?: string;
  lines?: string[];
  website?: string;
  stationRef?: string;
  source: string;
  sourceUrl?: string;
}
/** complete: everything in the radius was loaded. truncated: the per-category limit was hit. unavailable: the category could not be loaded. */
export type CategoryStatus = "complete" | "truncated" | "unavailable";
/**
 * complete: exact count. minimum: at least this many (category truncated).
 * not_covered: the chosen radius is smaller than the ring. unavailable: no data for the category.
 */
export type MetricStatus = "complete" | "minimum" | "not_covered" | "unavailable";
export type CategoryIssueReason = "limit" | "timeout" | "quota" | "error";
export interface CategoryMetric {
  status: CategoryStatus;
  /** Places of this category that were loaded inside the chosen radius. */
  total: number;
  nearestDistance: number | null;
  count500m: number | null;
  count500mStatus: MetricStatus;
  count1000m: number | null;
  count1000mStatus: MetricStatus;
  /** Shorthand for status === "complete". */
  complete: boolean;
}
export type LocationMetrics = Record<PlaceCategory, CategoryMetric>;
export interface CategoryIssue {
  category: PlaceCategory;
  reason: CategoryIssueReason;
}
export interface NearbyPlacesResponse {
  center: { latitude: number; longitude: number };
  radius: number;
  places: Place[];
  metrics: LocationMetrics;
  fetchedAt: string;
  /** True when the provider was unreachable and an expired cache entry (at most seven days old) is served. */
  stale: boolean;
  /** Categories that are not completely covered (limit reached or failed), see `issues` for the reason. */
  incomplete: PlaceCategory[];
  issues: CategoryIssue[];
  attribution: string;
}
export interface GeocodeResponse {
  query: string;
  suggestions: ResolvedAddress[];
  /**
   * Only for explicit resolution (/geocode): "unique" = exactly one confident match that may be used
   * without asking, "ambiguous" = the user has to choose, "none" = nothing plausible found.
   */
  resolution?: "unique" | "ambiguous" | "none";
  source: {
    sourceKey: string;
    fromCache: boolean;
    isStale: boolean;
    license: string;
    attribution: string;
  };
}
/** Machine-readable reason in error bodies of the location endpoints ({ statusCode, message, code, retryAfterSeconds? }). */
export type LocationErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "QUOTA"
  | "UNAVAILABLE";
export const LOCATION_RADII = [500, 1000, 2000, 5000] as const;
export const LOCATION_ATTRIBUTION = "© OpenStreetMap contributors · Geoapify";
