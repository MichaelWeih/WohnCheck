import {
  LOCATION_RADII,
  MetricStatus,
  PLACE_GROUPS,
  PLACE_KINDS,
  Place,
  PlaceCategory,
  PlaceKind,
  ResolvedAddress,
} from "./types";

export const ALL_CATEGORIES = Object.keys(PLACE_GROUPS) as PlaceCategory[];
export const DEFAULT_RADIUS = 1000;

export const categoryColors: Record<PlaceCategory, string> = {
  transit: "#2455a4",
  shopping: "#885b1d",
  health: "#a23545",
  education: "#7150a3",
  leisure: "#28704d",
  food: "#a24b28",
  infrastructure: "#506577",
};

/** Subcategories offered for a main category. Pharmacies are listed under health and shopping. */
export function kindsOf(category: PlaceCategory): PlaceKind[] {
  return (Object.keys(PLACE_KINDS) as PlaceKind[]).filter(
    (kind) =>
      PLACE_KINDS[kind][0] === category ||
      (kind === "pharmacy" && category === "shopping"),
  );
}

/**
 * The one filter used by map, clusters, counts and list. A place matches when one of its categories
 * is active; inside a category with selected subcategories it must also have one of those.
 * Categories without a selected subcategory are not narrowed down.
 */
export function visiblePlaces(
  places: Place[],
  categories: PlaceCategory[],
  kinds: PlaceKind[],
) {
  if (!categories.length) return [];
  const narrowed = new Map<PlaceCategory, PlaceKind[]>();
  for (const category of categories) {
    const selected = kindsOf(category).filter((kind) => kinds.includes(kind));
    if (selected.length) narrowed.set(category, selected);
  }
  return places.filter((place) =>
    place.categories.some((category) => {
      if (!categories.includes(category)) return false;
      const selected = narrowed.get(category);
      return !selected || place.kinds.some((kind) => selected.includes(kind));
    }),
  );
}

/** The category a place is shown under (colour, icon, group): its first active one. */
export function displayCategory(
  place: Place,
  active: PlaceCategory[] = ALL_CATEGORIES,
): PlaceCategory {
  return (
    place.categories.find((category) => active.includes(category)) ??
    place.categories[0]
  );
}

export type PlaceSort = "distance" | "category";

export function byDistance(a: Place, b: Place) {
  return a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, "de");
}

export interface PlaceGroup {
  category: PlaceCategory | null;
  places: Place[];
}

/**
 * "distance": one group, nearest first. "category": one group per main category in the fixed
 * category order, nearest first inside each group. Every place appears exactly once.
 */
export function groupPlaces(
  places: Place[],
  sort: PlaceSort,
  active: PlaceCategory[] = ALL_CATEGORIES,
): PlaceGroup[] {
  const sorted = [...places].sort(byDistance);
  if (sort === "distance") return [{ category: null, places: sorted }];
  return ALL_CATEGORIES.map((category) => ({
    category,
    places: sorted.filter((place) => displayCategory(place, active) === category),
  })).filter((group) => group.places.length > 0);
}

export function formatDistance(n: number) {
  return n < 1000
    ? `${Math.round(n)} m`
    : `${(n / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} km`;
}

export function formatRadius(radius: number) {
  return radius < 1000
    ? `${radius} m`
    : `${(radius / 1000).toLocaleString("de-DE")} km`;
}

/** Text for a ring count including its reliability, e.g. "12", "mind. 12", "nicht im Radius". */
export function formatMetric(value: number | null, status: MetricStatus) {
  if (status === "not_covered") return "nicht im Radius";
  if (status === "unavailable" || value === null) return "nicht verfügbar";
  return status === "minimum" ? `mind. ${value}` : String(value);
}

export function placeKindLabel(place: Place) {
  return place.kinds.map((kind) => PLACE_KINDS[kind][1]).join(" · ");
}

const finite = (value: string | null) =>
  value !== null && value.trim() !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;

/** Restores a confirmed address from the /check URL. Null when label or coordinates are missing or invalid. */
export function addressFromParams(p: URLSearchParams): ResolvedAddress | null {
  const label = p.get("address")?.trim();
  const lat = finite(p.get("lat"));
  const lon = finite(p.get("lng"));
  if (
    !label ||
    lat === null ||
    lon === null ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  const accuracy = p.get("accuracy");
  const houseNumber = p.get("houseNumber") ?? undefined;
  return {
    id: `${lat}:${lon}`,
    label,
    shortLabel: label,
    latitude: lat,
    longitude: lon,
    // A house number counts as confirmed only when the link says so; unknown values are the cautious "area".
    accuracy:
      accuracy === "building" || accuracy === "street" ? accuracy : "area",
    street: p.get("street") ?? undefined,
    houseNumber,
    postalCode: p.get("postalCode") ?? undefined,
    city: p.get("city") ?? undefined,
    country: p.get("country") ?? undefined,
  };
}

export function radiusFromParams(p: URLSearchParams): number {
  const radius = finite(p.get("radius"));
  return radius !== null && (LOCATION_RADII as readonly number[]).includes(radius)
    ? radius
    : DEFAULT_RADIUS;
}

/** No "categories" parameter means all categories; an empty one means none. */
export function categoriesFromParams(p: URLSearchParams): PlaceCategory[] {
  if (!p.has("categories")) return ALL_CATEGORIES;
  const requested = (p.get("categories") ?? "").split(",");
  return ALL_CATEGORIES.filter((category) => requested.includes(category));
}

export function kindsFromParams(p: URLSearchParams): PlaceKind[] {
  const requested = (p.get("kinds") ?? "").split(",");
  return (Object.keys(PLACE_KINDS) as PlaceKind[]).filter((kind) =>
    requested.includes(kind),
  );
}

export const ADDRESS_MIN_LENGTH = 3;
export const ADDRESS_DEBOUNCE_MS = 350;

/** Visible note on how exactly an address was located; a missing house number is always pointed out. */
export function accuracyLabel(address: Pick<ResolvedAddress, "accuracy">) {
  return address.accuracy === "building"
    ? "Hausnummer bestätigt"
    : address.accuracy === "street"
      ? "Straße · Hausnummer nicht bestätigt"
      : "Gebiet · keine genaue Hausadresse";
}

/** DOM id of a list entry, used to scroll to and re-focus the entry of the selected place. */
export const placeItemId = (id: string) =>
  `location-place-${encodeURIComponent(id)}`;
