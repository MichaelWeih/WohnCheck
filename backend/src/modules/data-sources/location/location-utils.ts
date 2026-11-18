import {
  CategoryStatus,
  LocationMetrics,
  MetricStatus,
  PLACE_GROUPS,
  Place,
  PlaceCategory,
} from "../../../common/api/location-types";

/** Great-circle distance in whole metres (Haversine, mean earth radius). */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) *
      Math.cos(lat2 * r) *
      Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return Math.round(
    6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))),
  );
}

/** Stops of one station may lie this far apart and still be merged when they share a station reference. */
const STATION_REF_MERGE_METERS = 400;
/** Without a shared reference only same-named stops of the same mode this close together are merged. */
const SAME_NAME_MERGE_METERS = 30;

function merge(target: Place, other: Place) {
  target.categories = [...new Set([...target.categories, ...other.categories])];
  target.kinds = [...new Set([...target.kinds, ...other.kinds])];
  const lines = [...new Set([...(target.lines ?? []), ...(other.lines ?? [])])];
  if (lines.length) target.lines = lines;
  target.address ??= other.address;
  target.openingHours ??= other.openingHours;
  target.website ??= other.website;
  target.stationRef ??= other.stationRef;
  target.sourceUrl ??= other.sourceUrl;
}

function sameStop(a: Place, b: Place): boolean {
  if (!a.kinds.some((kind) => b.kinds.includes(kind))) return false;
  const distance = distanceMeters(
    a.latitude,
    a.longitude,
    b.latitude,
    b.longitude,
  );
  if (a.stationRef && a.stationRef === b.stationRef)
    return distance <= STATION_REF_MERGE_METERS;
  return (
    a.name.toLocaleLowerCase("de") === b.name.toLocaleLowerCase("de") &&
    distance <= SAME_NAME_MERGE_METERS
  );
}

/**
 * Merges entries with the same provider/OSM id (e.g. a pharmacy returned for two categories) and,
 * cautiously, platforms of one stop: same transport mode and either a shared station reference or
 * the same name within 30 m. Different modes and neighbouring businesses always stay separate.
 * The nearest entry wins; the result is sorted by distance. The input is not modified.
 */
export function deduplicate(places: Place[]): Place[] {
  const result: Place[] = [];
  const byId = new Map<string, Place>();
  const stops: Place[] = [];
  const sorted = places
    .map((place) => ({ ...place }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  for (const place of sorted) {
    const isStop = place.categories.includes("transit");
    const match =
      byId.get(place.id) ??
      (isStop ? stops.find((other) => sameStop(other, place)) : undefined);
    if (match) {
      merge(match, place);
      continue;
    }
    byId.set(place.id, place);
    if (isStop) stops.push(place);
    result.push(place);
  }
  return result;
}

function ringStatus(
  status: CategoryStatus,
  radius: number,
  ring: number,
): MetricStatus {
  if (status === "unavailable") return "unavailable";
  if (radius < ring) return "not_covered";
  return status === "truncated" ? "minimum" : "complete";
}

/**
 * Per category: nearest distance and the number of places within 500 m and 1 000 m. Rings that the
 * chosen radius does not cover or that are based on incomplete data are flagged instead of being
 * reported as exact numbers.
 */
export function locationMetrics(
  places: Place[],
  radius: number,
  statuses: Partial<Record<PlaceCategory, CategoryStatus>> = {},
): LocationMetrics {
  return Object.fromEntries(
    (Object.keys(PLACE_GROUPS) as PlaceCategory[]).map((category) => {
      const status = statuses[category] ?? "complete";
      const matches = places.filter((place) =>
        place.categories.includes(category),
      );
      const count = (ring: number) => {
        const ringState = ringStatus(status, radius, ring);
        return {
          status: ringState,
          value:
            ringState === "complete" || ringState === "minimum"
              ? matches.filter((p) => p.distanceMeters <= ring).length
              : null,
        };
      };
      const within500 = count(500);
      const within1000 = count(1000);
      return [
        category,
        {
          status,
          total: matches.length,
          nearestDistance:
            matches.length && status !== "unavailable"
              ? Math.min(...matches.map((p) => p.distanceMeters))
              : null,
          count500m: within500.value,
          count500mStatus: within500.status,
          count1000m: within1000.value,
          count1000mStatus: within1000.status,
          complete: status === "complete",
        },
      ];
    }),
  ) as LocationMetrics;
}
