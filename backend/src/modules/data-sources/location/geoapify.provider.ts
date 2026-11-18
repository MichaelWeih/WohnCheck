import { Injectable } from "@nestjs/common";
import { OutboundHttpService } from "../../../common/http/outbound-http.types";
import {
  PLACE_KINDS,
  Place,
  PlaceCategory,
  PlaceKind,
  ResolvedAddress,
} from "../../../common/api/location-types";
import { distanceMeters } from "./location-utils";
import { missingKey } from "./location-errors";

/**
 * Geoapify Places categories per subcategory (https://apidocs.geoapify.com/docs/places/#categories).
 * Empty lists are subtypes that no Geoapify category proves; they are only assigned from explicit
 * OSM tags in the raw data (see normalizePlace) and never guessed.
 */
export const CATEGORY_MAP: Record<PlaceKind, string[]> = {
  bus: ["public_transport.bus"],
  tram: ["public_transport.tram"],
  subway: ["public_transport.subway"],
  suburban: ["public_transport.light_rail"],
  station: ["public_transport.train"],
  ferry: ["public_transport.ferry"],
  stop: ["public_transport.platform"],
  supermarket: ["commercial.supermarket", "commercial.discount_store"],
  convenience: ["commercial.convenience"],
  drugstore: ["commercial.chemist"],
  bakery: ["commercial.food_and_drink.bakery"],
  pharmacy: ["healthcare.pharmacy"],
  mall: ["commercial.shopping_mall"],
  market: ["commercial.marketplace"],
  doctor: ["healthcare.clinic_or_praxis"],
  general: [],
  dentist: ["healthcare.dentist"],
  hospital: ["healthcare.hospital"],
  clinic: [],
  veterinary: ["pet.veterinary"],
  childcare: ["childcare"],
  school: ["education.school"],
  primary: [],
  secondary: [],
  university: ["education.university", "education.college"],
  library: ["education.library"],
  park: ["leisure.park", "natural.forest"],
  fitness: ["sport.fitness"],
  sport: [
    "sport.pitch",
    "sport.sports_centre",
    "sport.sports_hall",
    "sport.stadium",
    "activity.sport_club",
  ],
  swimming: ["sport.swimming_pool"],
  cinema: ["entertainment.cinema"],
  theatre: ["entertainment.culture.theatre"],
  museum: ["entertainment.museum"],
  playground: ["leisure.playground"],
  restaurant: ["catering.restaurant"],
  cafe: ["catering.cafe"],
  bar: ["catering.bar", "catering.pub"],
  fastfood: ["catering.fast_food"],
  bank: ["service.financial.bank"],
  atm: ["service.financial.atm"],
  post: ["service.post.office"],
  parcel: ["service.post.parcel_locker"],
  fuel: ["service.vehicle.fuel"],
  charging: ["service.vehicle.charging_station"],
  government: ["office.government"],
  police: ["service.police"],
  fire: ["service.fire_station"],
};

const TRANSIT_KINDS: PlaceKind[] = [
  "bus",
  "tram",
  "subway",
  "suburban",
  "station",
  "ferry",
  "stop",
];
/** Results below this provider confidence are noise (e.g. random streets for a nonsense query). */
const MIN_GEOCODE_CONFIDENCE = 0.2;
/** A house number counts as confirmed from this building-level confidence on. */
const MIN_BUILDING_CONFIDENCE = 0.5;
/** Provider page size and the cap per main category (5 pages). */
const PAGE_SIZE = 100;
export const MAX_PLACES_PER_CATEGORY = 500;

type Rank = {
  confidence?: number;
  confidence_city_level?: number;
  confidence_street_level?: number;
  confidence_building_level?: number;
};
type Properties = {
  place_id?: string;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  street?: string;
  housenumber?: string | number;
  postcode?: string | number;
  city?: string;
  town?: string;
  village?: string;
  district?: string;
  suburb?: string;
  country?: string;
  country_code?: string;
  lat?: number;
  lon?: number;
  result_type?: string;
  rank?: Rank;
  categories?: string[];
  website?: string;
  opening_hours?: string;
  datasource?: { raw?: Record<string, unknown>; attribution?: string };
};
interface Feature {
  geometry?: { coordinates?: number[] };
  properties?: Properties;
}
interface Response {
  features?: Feature[];
}

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim()
    ? v.trim()
    : typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : undefined;

const safeWebsite = (v: unknown) => {
  const value = text(v);
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};

const list = (v: unknown): string[] =>
  (text(v) ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

function coordinates(feature: Feature): [number, number] | null {
  const p = feature.properties ?? {};
  const lat = p.lat ?? feature.geometry?.coordinates?.[1];
  const lon = p.lon ?? feature.geometry?.coordinates?.[0];
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  return [lat, lon];
}

/** Transport modes are taken from the provider category or explicit OSM tags only. */
function transitKinds(
  has: (prefix: string) => boolean,
  raw: Record<string, unknown>,
): PlaceKind[] {
  if (!has("public_transport")) return [];
  const kinds = new Set<PlaceKind>();
  if (
    has("public_transport.bus") ||
    raw.bus === "yes" ||
    raw.highway === "bus_stop" ||
    raw.amenity === "bus_station"
  )
    kinds.add("bus");
  if (
    has("public_transport.tram") ||
    raw.tram === "yes" ||
    raw.railway === "tram_stop"
  )
    kinds.add("tram");
  if (
    has("public_transport.subway") ||
    raw.subway === "yes" ||
    raw.station === "subway"
  )
    kinds.add("subway");
  if (
    has("public_transport.light_rail") ||
    raw.light_rail === "yes" ||
    raw.station === "light_rail" ||
    (raw.train === "yes" && /S-Bahn/i.test(text(raw.network) ?? ""))
  )
    kinds.add("suburban");
  if (
    has("public_transport.ferry") ||
    raw.ferry === "yes" ||
    raw.amenity === "ferry_terminal"
  )
    kinds.add("ferry");
  const railStation = raw.railway === "station" || raw.railway === "halt";
  if (
    (has("public_transport.train") || raw.train === "yes" || railStation) &&
    (kinds.size === 0 || (railStation && raw.train === "yes"))
  )
    kinds.add("station");
  // A platform without any mode tag stays a generic stop instead of being labelled as a station.
  if (!kinds.size) kinds.add("stop");
  return [...kinds];
}

/**
 * Maps one Geoapify place to the provider-independent Place. Returns null for hits outside the radius,
 * with unusable coordinates or without a category of ours. Details (opening hours, lines, website,
 * address) are only taken over when the source delivered them.
 */
export function normalizePlace(
  feature: Feature,
  latitude: number,
  longitude: number,
  radius: number,
): Place | null {
  const p = feature.properties ?? {};
  const raw = p.datasource?.raw ?? {};
  const position = coordinates(feature);
  if (!position) return null;
  const [lat, lon] = position;
  const distance = distanceMeters(latitude, longitude, lat, lon);
  if (distance > radius) return null;
  const categories = p.categories ?? [];
  const has = (prefix: string) =>
    categories.some((c) => c === prefix || c.startsWith(prefix + "."));
  // Entrances and lifts belong to a station that is listed itself.
  if (
    has("public_transport.subway.entrance") ||
    has("public_transport.subway.lift")
  )
    return null;
  const kinds = new Set<PlaceKind>(
    (Object.keys(CATEGORY_MAP) as PlaceKind[]).filter(
      (kind) => !TRANSIT_KINDS.includes(kind) && CATEGORY_MAP[kind].some(has),
    ),
  );
  for (const kind of transitKinds(has, raw)) kinds.add(kind);
  if (kinds.has("doctor")) {
    if (raw.amenity === "clinic" || raw.healthcare === "clinic") {
      kinds.delete("doctor");
      kinds.add("clinic");
    } else if (
      has("healthcare.clinic_or_praxis.general") ||
      list(raw["healthcare:speciality"]).includes("general")
    )
      kinds.add("general");
  }
  if (kinds.has("school")) {
    const levels = list(raw["isced:level"]).flatMap((level) =>
      level.split(/[,-]/).map((part) => part.trim()),
    );
    if (levels.includes("1")) kinds.add("primary");
    if (levels.includes("2") || levels.includes("3")) kinds.add("secondary");
  }
  if (!kinds.size) return null;
  const kindList = [...kinds];
  const groups = new Set<PlaceCategory>(
    kindList.map((kind) => PLACE_KINDS[kind][0]),
  );
  if (kinds.has("pharmacy")) groups.add("shopping");
  const rawType = text(raw.osm_type);
  const osmType =
    ({ n: "node", w: "way", r: "relation" } as Record<string, string>)[
      rawType ?? ""
    ] ?? rawType;
  const osmId = text(raw.osm_id);
  const isOsm =
    !!osmId && !!osmType && ["node", "way", "relation"].includes(osmType);
  const name = text(p.name) ?? text(raw.name);
  const lines = list(raw.route_ref);
  return {
    id: isOsm
      ? `osm:${osmType}:${osmId}`
      : (text(p.place_id) ?? `geo:${lon}:${lat}:${name ?? ""}`),
    name: name ?? PLACE_KINDS[kindList[0]][1],
    categories: [...groups],
    kinds: kindList,
    latitude: lat,
    longitude: lon,
    distanceMeters: distance,
    address: (name ? text(p.address_line2) : undefined) ?? text(p.formatted),
    openingHours: text(raw.opening_hours) ?? text(p.opening_hours),
    lines: lines.length ? lines : undefined,
    website: safeWebsite(raw.website ?? raw["contact:website"] ?? p.website),
    stationRef: text(raw["ref:IFOPT"])?.split(":").slice(0, 3).join(":"),
    source: "Geoapify / OpenStreetMap",
    sourceUrl: isOsm
      ? `https://www.openstreetmap.org/${osmType}/${osmId}`
      : undefined,
  };
}

/**
 * Normalises one geocoding hit. Nothing is filled in: a house number the provider could not confirm
 * is dropped (the hit then counts as street-level), missing parts stay undefined.
 */
export function normalizeAddress(feature: Feature): ResolvedAddress | null {
  const p = feature.properties ?? {};
  const position = coordinates(feature);
  const formatted = text(p.formatted);
  if (!position || !formatted) return null;
  if (p.country_code && p.country_code.toLowerCase() !== "de") return null;
  const rank = p.rank ?? {};
  if (
    typeof rank.confidence === "number" &&
    rank.confidence < MIN_GEOCODE_CONFIDENCE
  )
    return null;
  const street = text(p.street);
  const postalCode = text(p.postcode);
  const city = text(p.city) ?? text(p.town) ?? text(p.village);
  const country = text(p.country);
  const reportedNumber = text(p.housenumber);
  const numberConfirmed =
    !!reportedNumber &&
    !(
      typeof rank.confidence_building_level === "number" &&
      rank.confidence_building_level < MIN_BUILDING_CONFIDENCE
    );
  const houseNumber = numberConfirmed ? reportedNumber : undefined;
  // The provider echoes an unconfirmed number in its formatted text; rebuild the label without it.
  const label =
    reportedNumber && !numberConfirmed && street
      ? [street, [postalCode, city].filter(Boolean).join(" "), country]
          .filter(Boolean)
          .join(", ")
      : formatted;
  return {
    id: text(p.place_id) ?? formatted,
    label,
    shortLabel: street
      ? [street, houseNumber].filter(Boolean).join(" ")
      : (text(p.address_line1) ?? label),
    latitude: position[0],
    longitude: position[1],
    street,
    houseNumber,
    postalCode,
    city,
    district: text(p.district) ?? text(p.suburb),
    country,
    countryCode: text(p.country_code)?.toLowerCase(),
    accuracy: houseNumber ? "building" : street ? "street" : "area",
    confidence:
      typeof rank.confidence === "number"
        ? Math.round(
            rank.confidence * (rank.confidence_city_level ?? 0.5) * 100,
          ) / 100
        : undefined,
  };
}

/** The only place that knows Geoapify URLs, parameters, categories and response shapes. */
@Injectable()
export class GeoapifyProvider {
  constructor(private readonly http: OutboundHttpService) {}

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<Response> {
    const key = process.env.GEOAPIFY_API_KEY?.trim();
    if (!key) throw missingKey();
    const base = new URL(
      process.env.GEOAPIFY_BASE_URL?.trim() || "https://api.geoapify.com",
    );
    // Central provider limiter: spacing and daily budget are enforced (and persisted) by the outbound client.
    this.http.registerHost({
      host: base.hostname,
      minIntervalMs: Math.ceil(
        1000 /
          Math.max(
            0.1,
            Math.min(10, Number(process.env.GEOAPIFY_REQUESTS_PER_SECOND) || 2),
          ),
      ),
      dailyBudget: Number(process.env.GEOAPIFY_DAILY_BUDGET) || 2500,
    });
    const url = new URL(path, base);
    // Geoapify only accepts the key as a query parameter; the outbound client redacts it in logs and errors.
    for (const [k, v] of Object.entries({ ...params, apiKey: key }))
      url.searchParams.set(k, v);
    return this.http.getJson<Response>(url.href, {
      timeoutMs: 12000,
      retries: 1,
      maxResponseBytes: 5_000_000,
    });
  }

  async search(
    query: string,
    autocomplete: boolean,
  ): Promise<ResolvedAddress[]> {
    const response = await this.request(
      `/v1/geocode/${autocomplete ? "autocomplete" : "search"}`,
      { text: query, filter: "countrycode:de", lang: "de", limit: "6" },
    );
    if (!Array.isArray(response.features))
      throw new Error("Invalid geocoding response");
    // Businesses at one address come back as separate hits; one entry per address is enough.
    const seen = new Set<string>();
    return response.features.flatMap((feature) => {
      const address = normalizeAddress(feature);
      if (!address) return [];
      const key = (
        address.street
          ? [
              address.street,
              address.houseNumber,
              address.postalCode,
              address.city,
            ].join("|")
          : address.label
      ).toLocaleLowerCase("de");
      if (seen.has(key)) return [];
      seen.add(key);
      return [address];
    });
  }

  async searchNearby(
    latitude: number,
    longitude: number,
    radius: number,
    category: PlaceCategory,
  ) {
    const cats = [
      ...new Set(
        (Object.keys(CATEGORY_MAP) as PlaceKind[])
          .filter(
            (k) =>
              PLACE_KINDS[k][0] === category ||
              (category === "shopping" && k === "pharmacy"),
          )
          .flatMap((k) => CATEGORY_MAP[k]),
      ),
    ];
    const places: Place[] = [];
    let truncated = false;
    for (
      let offset = 0;
      offset < MAX_PLACES_PER_CATEGORY;
      offset += PAGE_SIZE
    ) {
      const response = await this.request("/v2/places", {
        categories: cats.join(","),
        filter: `circle:${longitude},${latitude},${radius}`,
        bias: `proximity:${longitude},${latitude}`,
        limit: String(PAGE_SIZE),
        offset: String(offset),
        lang: "de",
      });
      if (!Array.isArray(response.features))
        throw new Error("Invalid places response");
      for (const f of response.features) {
        const place = normalizePlace(f, latitude, longitude, radius);
        if (place) places.push(place);
      }
      if (response.features.length < PAGE_SIZE) break;
      // A full last page means the provider may hold more than the cap allows us to load.
      if (offset + PAGE_SIZE >= MAX_PLACES_PER_CATEGORY) truncated = true;
    }
    return { places, truncated };
  }
}
