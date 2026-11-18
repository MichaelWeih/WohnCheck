import { distanceMeters, deduplicate, locationMetrics } from "./location-utils";
import { normalizePlace } from "./geoapify.provider";
import { Place } from "../../../common/api/location-types";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: "Haltestelle",
  latitude: 52.438,
  longitude: 13.345,
  distanceMeters: 100,
  categories: ["transit"],
  kinds: ["bus"],
  source: "fixture",
  ...overrides,
});

const feature = (
  categories: string[],
  raw: Record<string, unknown> = {},
  properties: Record<string, unknown> = {},
) => ({
  properties: {
    lat: 52,
    lon: 13,
    categories,
    datasource: { raw },
    ...properties,
  },
});

describe("Haversine distance", () => {
  it("calculates known distances and identity", () => {
    expect(distanceMeters(0, 0, 0, 0)).toBe(0);
    expect(distanceMeters(0, 0, 0, 1)).toBe(111195);
    // Berlin Mitte to Munich Marienplatz: about 504 km.
    const berlinMunich = distanceMeters(52.52, 13.405, 48.137, 11.575);
    expect(berlinMunich).toBeGreaterThan(503000);
    expect(berlinMunich).toBeLessThan(506000);
  });

  it("is symmetric", () => {
    expect(distanceMeters(52.4384, 13.3496, 52.4374, 13.345)).toBe(
      distanceMeters(52.4374, 13.345, 52.4384, 13.3496),
    );
  });
});

describe("radius boundary", () => {
  // 0.008993 degrees of latitude are 1 000 m on the mean-radius sphere.
  const at = (latitude: number) =>
    normalizePlace(
      feature(["commercial.supermarket"], {}, { lat: latitude, lon: 13 }),
      52,
      13,
      1000,
    );

  it("keeps a place exactly on the radius and drops the next metre", () => {
    expect(at(52.008993)?.distanceMeters).toBe(1000);
    expect(at(52.00901)).toBeNull();
  });

  it("rejects far away places and unusable coordinates", () => {
    expect(at(48)).toBeNull();
    expect(normalizePlace({}, 52, 13, 1000)).toBeNull();
    expect(
      normalizePlace(
        feature(["commercial.supermarket"], {}, { lat: 95, lon: 13 }),
        52,
        13,
        1000,
      ),
    ).toBeNull();
  });
});

describe("category mapping", () => {
  const kinds = (categories: string[], raw: Record<string, unknown> = {}) =>
    normalizePlace(feature(categories, raw), 52, 13, 1000)?.kinds;

  it("maps pharmacies to health and shopping without inventing details", () => {
    const p = normalizePlace(
      feature(["healthcare.pharmacy"], {}, { place_id: "a", name: "Apotheke" }),
      52,
      13,
      1000,
    )!;
    expect(p.categories.sort()).toEqual(["health", "shopping"]);
    expect(p.openingHours).toBeUndefined();
    expect(p.lines).toBeUndefined();
    expect(p.website).toBeUndefined();
    expect(p.sourceUrl).toBeUndefined();
    expect(p.distanceMeters).toBe(0);
  });

  it("does not derive a primary school from a general school tag", () => {
    expect(kinds(["education.school"])).toEqual(["school"]);
    expect(kinds(["education.school"], { "isced:level": "1" })).toEqual([
      "school",
      "primary",
    ]);
    expect(kinds(["education.school"], { "isced:level": "2;3" })).toEqual([
      "school",
      "secondary",
    ]);
  });

  it("separates practices, general practitioners and clinics by source tags", () => {
    const praxis = ["healthcare", "healthcare.clinic_or_praxis"];
    expect(kinds(praxis, { amenity: "doctors" })).toEqual(["doctor"]);
    expect(kinds(praxis, { amenity: "clinic" })).toEqual(["clinic"]);
    expect(
      kinds(praxis, { "healthcare:speciality": "general;internal" }),
    ).toEqual(["doctor", "general"]);
    expect(
      kinds([...praxis, "healthcare.clinic_or_praxis.general"]),
    ).toEqual(["doctor", "general"]);
  });

  it("takes transport modes from tags and keeps unknown platforms generic", () => {
    const platform = ["public_transport", "public_transport.platform"];
    expect(kinds(platform, { bus: "yes", highway: "platform" })).toEqual([
      "bus",
    ]);
    expect(kinds(platform, { light_rail: "yes" })).toEqual(["suburban"]);
    expect(kinds(platform)).toEqual(["stop"]);
    expect(kinds(["public_transport", "public_transport.tram"])).toEqual([
      "tram",
    ]);
    expect(
      kinds(["public_transport", "public_transport.train"], {
        railway: "station",
        train: "yes",
      }),
    ).toEqual(["station"]);
    expect(
      kinds(["public_transport", "public_transport.subway"], {
        railway: "station",
        station: "subway",
      }),
    ).toEqual(["subway"]);
  });

  it("skips subway entrances and places without a category of ours", () => {
    expect(
      kinds(["public_transport", "public_transport.subway.entrance"]),
    ).toBeUndefined();
    expect(kinds(["tourism.attraction"])).toBeUndefined();
  });

  it("uses stable OSM ids with a link to the original source", () => {
    const p = normalizePlace(
      feature(["catering.cafe"], {
        osm_type: "n",
        osm_id: 4711,
        opening_hours: "Mo-Fr 08:00-18:00",
        "contact:website": "https://example.org/cafe",
        route_ref: "M82; X83",
      }),
      52,
      13,
      1000,
    )!;
    expect(p.id).toBe("osm:node:4711");
    expect(p.sourceUrl).toBe("https://www.openstreetmap.org/node/4711");
    expect(p.openingHours).toBe("Mo-Fr 08:00-18:00");
    expect(p.website).toBe("https://example.org/cafe");
    expect(p.lines).toEqual(["M82", "X83"]);
    expect(p.name).toBe("Café");
  });

  it("drops websites that are not http(s) links", () => {
    expect(
      normalizePlace(
        feature(["catering.cafe"], { website: "javascript:alert(1)" }),
        52,
        13,
        1000,
      )!.website,
    ).toBeUndefined();
  });
});

describe("deduplication", () => {
  it("merges identical ids and unions their categories", () => {
    const merged = deduplicate([
      place("osm:node:1", { categories: ["health"], kinds: ["pharmacy"] }),
      place("osm:node:1", { categories: ["shopping"], kinds: ["pharmacy"] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].categories.sort()).toEqual(["health", "shopping"]);
  });

  it("merges same-named stops of one mode within 30 m only", () => {
    // 0.00001 degrees of latitude are about 1.1 m, 0.0004 about 44 m.
    expect(
      deduplicate([place("a"), place("b", { latitude: 52.43801 })]),
    ).toHaveLength(1);
    expect(
      deduplicate([place("a"), place("b", { latitude: 52.4384 })]),
    ).toHaveLength(2);
  });

  it("keeps different modes and differently named stops apart", () => {
    expect(
      deduplicate([place("a"), place("b", { kinds: ["tram"] })]),
    ).toHaveLength(2);
    expect(
      deduplicate([place("a"), place("b", { name: "Andere Haltestelle" })]),
    ).toHaveLength(2);
  });

  it("merges platforms that share a station reference", () => {
    const merged = deduplicate([
      place("a", { stationRef: "de:11000:900067221", lines: ["S25"] }),
      place("b", {
        stationRef: "de:11000:900067221",
        name: "Lankwitz Gleis 2",
        latitude: 52.4388,
        distanceMeters: 150,
        lines: ["S26"],
      }),
      place("c", {
        stationRef: "de:11000:900067221",
        kinds: ["suburban"],
        distanceMeters: 160,
      }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].lines).toEqual(["S25", "S26"]);
  });

  it("never merges neighbouring businesses with the same name", () => {
    const shop = { categories: ["shopping" as const], kinds: ["bakery" as const] };
    expect(
      deduplicate([
        place("a", { ...shop, name: "Bäckerei" }),
        place("b", { ...shop, name: "Bäckerei", latitude: 52.43801 }),
      ]),
    ).toHaveLength(2);
  });

  it("sorts by distance and leaves the input untouched", () => {
    const input = [
      place("far", { name: "B", distanceMeters: 300 }),
      place("near", { name: "A", distanceMeters: 20 }),
    ];
    expect(deduplicate(input).map((p) => p.id)).toEqual(["near", "far"]);
    expect(input.map((p) => p.id)).toEqual(["far", "near"]);
  });
});

describe("metrics", () => {
  const places = [
    place("a", { distanceMeters: 120 }),
    place("b", { name: "B", distanceMeters: 500 }),
    place("c", { name: "C", distanceMeters: 501 }),
    place("d", { name: "D", distanceMeters: 1000 }),
    place("e", { name: "E", distanceMeters: 1800 }),
  ];

  it("counts the 500 m and 1 000 m rings inclusively", () => {
    const { transit, food } = locationMetrics(places, 2000);
    expect(transit).toMatchObject({
      status: "complete",
      total: 5,
      nearestDistance: 120,
      count500m: 2,
      count500mStatus: "complete",
      count1000m: 4,
      count1000mStatus: "complete",
      complete: true,
    });
    expect(food).toMatchObject({
      total: 0,
      nearestDistance: null,
      count500m: 0,
      count1000m: 0,
    });
  });

  it("flags rings the chosen radius does not cover", () => {
    const { transit } = locationMetrics(places.slice(0, 2), 500);
    expect(transit.count500m).toBe(2);
    expect(transit.count1000m).toBeNull();
    expect(transit.count1000mStatus).toBe("not_covered");
  });

  it("reports minimum counts for a truncated category", () => {
    const { transit } = locationMetrics(places, 2000, { transit: "truncated" });
    expect(transit.status).toBe("truncated");
    expect(transit.complete).toBe(false);
    expect(transit.count500m).toBe(2);
    expect(transit.count500mStatus).toBe("minimum");
    expect(transit.count1000mStatus).toBe("minimum");
  });

  it("gives no numbers for a category that could not be loaded", () => {
    const { transit, shopping } = locationMetrics(places, 2000, {
      transit: "unavailable",
    });
    expect(transit).toMatchObject({
      status: "unavailable",
      nearestDistance: null,
      count500m: null,
      count500mStatus: "unavailable",
      count1000m: null,
      count1000mStatus: "unavailable",
    });
    expect(shopping.status).toBe("complete");
  });
});
