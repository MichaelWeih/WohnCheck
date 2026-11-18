import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { addressParams, locationErrorKind, locationErrorText } from "./api";
import type { Place, ResolvedAddress } from "./types";
import {
  ALL_CATEGORIES,
  accuracyLabel,
  addressFromParams,
  categoriesFromParams,
  displayCategory,
  formatDistance,
  formatMetric,
  formatRadius,
  groupPlaces,
  kindsFromParams,
  kindsOf,
  radiusFromParams,
  visiblePlaces,
} from "./utils";

const place = (id: string, overrides: Partial<Place>): Place => ({
  id,
  name: id,
  categories: ["transit"],
  kinds: ["bus"],
  latitude: 52,
  longitude: 13,
  distanceMeters: 10,
  source: "fixture",
  ...overrides,
});

const pharmacy = place("pharmacy", {
  categories: ["health", "shopping"],
  kinds: ["pharmacy"],
  distanceMeters: 300,
});
const bus = place("bus", { distanceMeters: 20 });
const tram = place("tram", { kinds: ["tram"], distanceMeters: 150 });
const market = place("market", {
  categories: ["shopping"],
  kinds: ["supermarket"],
  distanceMeters: 80,
});
const places = [pharmacy, bus, tram, market];
const ids = (list: Place[]) => list.map((p) => p.id).sort();

describe("visiblePlaces (shared by map, counts and list)", () => {
  it("shows everything with all categories and no subcategory", () => {
    expect(visiblePlaces(places, ALL_CATEGORIES, [])).toHaveLength(4);
  });

  it("shows nothing when every category is switched off", () => {
    expect(visiblePlaces(places, [], [])).toEqual([]);
    expect(visiblePlaces(places, [], ["bus"])).toEqual([]);
  });

  it("filters by a single category", () => {
    expect(ids(visiblePlaces(places, ["transit"], []))).toEqual(["bus", "tram"]);
  });

  it("lists a place of two categories once", () => {
    const result = visiblePlaces(places, ["shopping", "health"], []);
    expect(ids(result)).toEqual(["market", "pharmacy"]);
    expect(ids(visiblePlaces(places, ["health"], []))).toEqual(["pharmacy"]);
  });

  it("applies a subcategory only inside its own category", () => {
    expect(ids(visiblePlaces(places, ["transit", "shopping"], ["bus"]))).toEqual([
      "bus",
      "market",
      "pharmacy",
    ]);
    expect(ids(visiblePlaces(places, ["transit"], ["bus", "tram"]))).toEqual([
      "bus",
      "tram",
    ]);
  });

  it("narrows shopping and health with the pharmacy subcategory", () => {
    expect(
      ids(visiblePlaces(places, ["shopping", "health"], ["pharmacy"])),
    ).toEqual(["pharmacy"]);
  });

  it("ignores subcategories of categories that are switched off", () => {
    expect(ids(visiblePlaces(places, ["transit"], ["pharmacy"]))).toEqual([
      "bus",
      "tram",
    ]);
  });
});

describe("grouping and sorting", () => {
  it("sorts nearest first by default", () => {
    const [group] = groupPlaces(places, "distance");
    expect(group.category).toBeNull();
    expect(group.places.map((p) => p.id)).toEqual([
      "bus",
      "market",
      "tram",
      "pharmacy",
    ]);
  });

  it("groups by category in fixed order and by distance inside", () => {
    const groups = groupPlaces(places, "category");
    expect(groups.map((g) => g.category)).toEqual([
      "transit",
      "shopping",
      "health",
    ]);
    expect(groups[0].places.map((p) => p.id)).toEqual(["bus", "tram"]);
    expect(groups.flatMap((g) => g.places)).toHaveLength(places.length);
  });

  it("files a place under its first active category", () => {
    expect(displayCategory(pharmacy)).toBe("health");
    expect(displayCategory(pharmacy, ["shopping"])).toBe("shopping");
    const groups = groupPlaces([pharmacy, market], "category", ["shopping"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].places).toHaveLength(2);
  });

  it("offers the pharmacy subcategory under health and shopping", () => {
    expect(kindsOf("health")).toContain("pharmacy");
    expect(kindsOf("shopping")).toContain("pharmacy");
    expect(kindsOf("transit")).not.toContain("pharmacy");
  });
});

describe("formatting", () => {
  it("formats distances and radii in German", () => {
    expect(formatDistance(84.4)).toBe("84 m");
    expect(formatDistance(1250)).toBe("1,25 km");
    expect(formatRadius(500)).toBe("500 m");
    expect(formatRadius(5000)).toBe("5 km");
  });

  it("labels counts that are not exact", () => {
    expect(formatMetric(12, "complete")).toBe("12");
    expect(formatMetric(0, "complete")).toBe("0");
    expect(formatMetric(12, "minimum")).toBe("mind. 12");
    expect(formatMetric(null, "not_covered")).toBe("nicht im Radius");
    expect(formatMetric(null, "unavailable")).toBe("nicht verfügbar");
  });

  it("always points out a missing house number", () => {
    expect(accuracyLabel({ accuracy: "building" })).toContain("bestätigt");
    expect(accuracyLabel({ accuracy: "street" })).toContain(
      "Hausnummer nicht bestätigt",
    );
    expect(accuracyLabel({ accuracy: "area" })).toContain("keine genaue");
  });
});

describe("URL state", () => {
  const address: ResolvedAddress = {
    id: "x",
    label: "Kaiser-Wilhelm-Straße 103, 12247 Berlin, Deutschland",
    shortLabel: "Kaiser-Wilhelm-Straße 103",
    latitude: 52.4384639,
    longitude: 13.3496772,
    street: "Kaiser-Wilhelm-Straße",
    houseNumber: "103",
    postalCode: "12247",
    city: "Berlin",
    country: "Deutschland",
    accuracy: "building",
  };

  it("round-trips a confirmed address", () => {
    const restored = addressFromParams(addressParams(address))!;
    expect(restored).toMatchObject({
      label: address.label,
      latitude: address.latitude,
      longitude: address.longitude,
      street: "Kaiser-Wilhelm-Straße",
      houseNumber: "103",
      postalCode: "12247",
      city: "Berlin",
      country: "Deutschland",
      accuracy: "building",
    });
  });

  it("omits parts the address does not have", () => {
    const params = addressParams({
      ...address,
      houseNumber: undefined,
      accuracy: "street",
    });
    expect(params.has("houseNumber")).toBe(false);
    const restored = addressFromParams(params)!;
    expect(restored.houseNumber).toBeUndefined();
    expect(restored.accuracy).toBe("street");
  });

  it("rejects links without label or with invalid coordinates", () => {
    const parse = (query: string) => addressFromParams(new URLSearchParams(query));
    expect(parse("address=Berlin")).toBeNull();
    expect(parse("lat=52&lng=13")).toBeNull();
    expect(parse("address=Berlin&lat=&lng=13")).toBeNull();
    expect(parse("address=Berlin&lat=abc&lng=13")).toBeNull();
    expect(parse("address=Berlin&lat=91&lng=13")).toBeNull();
    expect(parse("address=Berlin&lat=52&lng=181")).toBeNull();
    expect(parse("address=Berlin&lat=52&lng=13")?.accuracy).toBe("area");
  });

  it("falls back to 1 km for unknown radii", () => {
    const radius = (query: string) => radiusFromParams(new URLSearchParams(query));
    expect(radius("")).toBe(1000);
    expect(radius("radius=500")).toBe(500);
    expect(radius("radius=5000")).toBe(5000);
    expect(radius("radius=750")).toBe(1000);
    expect(radius("radius=abc")).toBe(1000);
  });

  it("reads category and subcategory filters and ignores unknown values", () => {
    const params = (query: string) => new URLSearchParams(query);
    expect(categoriesFromParams(params(""))).toEqual(ALL_CATEGORIES);
    expect(categoriesFromParams(params("categories="))).toEqual([]);
    expect(categoriesFromParams(params("categories=food,transit,hack"))).toEqual([
      "transit",
      "food",
    ]);
    expect(kindsFromParams(params("kinds=bus,pharmacy,constructor"))).toEqual([
      "bus",
      "pharmacy",
    ]);
    expect(kindsFromParams(params(""))).toEqual([]);
  });
});

describe("error states", () => {
  it("distinguishes configuration, timeout, quota, rate limit and outage", () => {
    expect(locationErrorKind(new ApiError("x", 503, "NOT_CONFIGURED"))).toBe(
      "config",
    );
    expect(locationErrorKind(new ApiError("x", 504, "TIMEOUT"))).toBe("timeout");
    expect(locationErrorKind(new ApiError("x", 503, "QUOTA"))).toBe("quota");
    expect(locationErrorKind(new ApiError("x", 429))).toBe("rate-limit");
    expect(locationErrorKind(new ApiError("x", 503, "UNAVAILABLE"))).toBe(
      "unavailable",
    );
    expect(locationErrorKind(new TypeError("Failed to fetch"))).toBe("offline");
  });

  it("offers no retry for a missing configuration and names the wait time for quotas", () => {
    const config = locationErrorText(
      new ApiError("x", 503, "NOT_CONFIGURED"),
      "places",
    );
    expect(config.retry).toBe(false);
    expect(config.text).toContain("GEOAPIFY_API_KEY");
    expect(config.text).toContain("keine Beispieldaten");
    const quota = locationErrorText(new ApiError("x", 503, "QUOTA", 45), "places");
    expect(quota.retry).toBe(true);
    expect(quota.text).toContain("50 Sekunden");
    expect(
      locationErrorText(new ApiError("x", 503, "QUOTA", 600), "places").text,
    ).toContain("10 Minuten");
  });
});
