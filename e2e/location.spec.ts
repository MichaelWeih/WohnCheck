import { test, expect, Page, Route } from "@playwright/test";

/**
 * Browser tests of the address check with reproducible provider fixtures: every request to the
 * backend location endpoints and to the map tile host is answered here, nothing reaches Geoapify.
 * The live test at the end is opt-in (LOCATION_LIVE_TEST=1) and uses the configured API key.
 */

const CENTER = { latitude: 52.438, longitude: 13.345 };
const address = {
  id: "fixture",
  label: "Kaiser-Wilhelm-Straße 103, 12247 Berlin",
  shortLabel: "Kaiser-Wilhelm-Straße 103",
  ...CENTER,
  street: "Kaiser-Wilhelm-Straße",
  houseNumber: "103",
  postalCode: "12247",
  city: "Berlin",
  country: "Deutschland",
  accuracy: "building",
  confidence: 1,
};
const streetOnly = {
  id: "street",
  label: "Kaiser-Wilhelm-Straße, 12247 Berlin",
  shortLabel: "Kaiser-Wilhelm-Straße",
  latitude: 52.4392,
  longitude: 13.3505,
  street: "Kaiser-Wilhelm-Straße",
  postalCode: "12247",
  city: "Berlin",
  country: "Deutschland",
  accuracy: "street",
  confidence: 1,
};
const second = {
  ...address,
  id: "second",
  label: "Zweite Straße 2, 10115 Berlin",
  shortLabel: "Zweite Straße 2",
  latitude: 52.53,
  longitude: 13.39,
  street: "Zweite Straße",
  houseNumber: "2",
  postalCode: "10115",
};
const groups = [
  "transit",
  "shopping",
  "health",
  "education",
  "leisure",
  "food",
  "infrastructure",
] as const;

type Fixture = {
  id: string;
  name: string;
  categories: string[];
  kinds: string[];
  latitude: number;
  longitude: number;
  distanceMeters: number;
  source: string;
  address?: string;
  openingHours?: string;
  website?: string;
  sourceUrl?: string;
};
const bus: Fixture = {
  id: "osm:node:1",
  name: "Test-Haltestelle",
  categories: ["transit"],
  kinds: ["bus"],
  latitude: 52.4388,
  longitude: 13.345,
  distanceMeters: 111,
  source: "Testfixture",
};
const shop: Fixture = {
  id: "osm:node:2",
  name: "Test-Supermarkt",
  categories: ["shopping"],
  kinds: ["supermarket"],
  latitude: 52.438,
  longitude: 13.3468,
  distanceMeters: 222,
  source: "Testfixture",
  address: "Testweg 5, 12247 Berlin",
  openingHours: "Mo-Sa 07:00-22:00",
  website: "https://example.org/markt",
  sourceUrl: "https://www.openstreetmap.org/node/2",
};
const pharmacy: Fixture = {
  id: "osm:node:3",
  name: "Test-Apotheke",
  categories: ["health", "shopping"],
  kinds: ["pharmacy"],
  latitude: 52.4372,
  longitude: 13.344,
  distanceMeters: 215,
  source: "Testfixture",
};
const base = [bus, shop, pharmacy];
/** Twelve cafés within about 40 m: one cluster at the start zoom. */
const cafes: Fixture[] = Array.from({ length: 12 }, (_, i) => ({
  id: `osm:node:${100 + i}`,
  name: `Test-Café ${i + 1}`,
  categories: ["food"],
  kinds: ["cafe"],
  latitude: 52.4415 + (i % 4) * 0.0001,
  longitude: 13.3405 + Math.floor(i / 4) * 0.00015,
  distanceMeters: 480 + i,
  source: "Testfixture",
}));

function nearbyBody(places: Fixture[], radius: number, overrides = {}) {
  return {
    center: CENTER,
    radius,
    places,
    metrics: Object.fromEntries(
      groups.map((group) => {
        const matches = places.filter((p) => p.categories.includes(group));
        return [
          group,
          {
            status: "complete",
            total: matches.length,
            nearestDistance: matches.length
              ? Math.min(...matches.map((p) => p.distanceMeters))
              : null,
            count500m: matches.filter((p) => p.distanceMeters <= 500).length,
            count500mStatus: "complete",
            count1000m:
              radius >= 1000
                ? matches.filter((p) => p.distanceMeters <= 1000).length
                : null,
            count1000mStatus: radius >= 1000 ? "complete" : "not_covered",
            complete: true,
          },
        ];
      }),
    ),
    fetchedAt: "2026-11-18T12:00:00Z",
    stale: false,
    incomplete: [],
    issues: [],
    attribution: "Testfixture",
    ...overrides,
  };
}

const geocodeBody = (suggestions: unknown[], resolution?: string) => ({
  query: "",
  suggestions,
  ...(resolution ? { resolution } : {}),
  source: {
    sourceKey: "fixture",
    fromCache: false,
    isStale: false,
    license: "ODbL",
    attribution: "Testfixture",
  },
});

type Options = {
  places?: Fixture[];
  /** Replaces the default answer of nearby-places. */
  nearby?: (route: Route, url: URL) => Promise<unknown> | unknown;
  consent?: boolean | null;
};

async function setup(page: Page, options: Options = {}) {
  const { places = base, consent = false } = options;
  if (consent !== null)
    await page.addInitScript(
      (externalMedia) =>
        localStorage.setItem(
          "wohnweise-consent-v1",
          JSON.stringify({ essential: true, externalMedia }),
        ),
      consent,
    );
  await page.route("**/api/data-sources/**", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    if (url.pathname.endsWith("/nearby-places")) {
      if (options.nearby) return options.nearby(route, url);
      return route.fulfill({
        json: nearbyBody(places, Number(url.searchParams.get("radius"))),
      });
    }
    const explicit = url.pathname.endsWith("/geocode");
    if (q.startsWith("INVALID"))
      return route.fulfill({ json: geocodeBody([], explicit ? "none" : undefined) });
    if (q.startsWith("Hauptstraße"))
      return route.fulfill({
        json: geocodeBody([address, second], explicit ? "ambiguous" : undefined),
      });
    if (q.startsWith("Zweite"))
      return route.fulfill({
        json: geocodeBody([second], explicit ? "unique" : undefined),
      });
    if (q === "Kaiser-Wilhelm-Straße, Berlin")
      return route.fulfill({
        json: geocodeBody([streetOnly], explicit ? "unique" : undefined),
      });
    return route.fulfill({
      json: geocodeBody([address], explicit ? "unique" : undefined),
    });
  });
  // A style without external sources: the map renders real WebGL, the test stays offline.
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#edf2f8" },
          },
        ],
      },
    }),
  );
  await page.route("https://tiles.openfreemap.org/fonts/**", (route) =>
    route.fulfill({ body: "", contentType: "application/x-protobuf" }),
  );
}

const checkUrl = (target: Record<string, unknown> = address, extra = {}) =>
  "/check?" +
  new URLSearchParams({
    address: String(target.label),
    lat: String(target.latitude),
    lng: String(target.longitude),
    accuracy: String(target.accuracy),
    ...extra,
  });

/** The address field; the radius and sorting selects are comboboxes too. */
const addressInput = (page: Page) =>
  page.getByRole("combobox", { name: "Adresse prüfen" });

/** Address suggestions only; the selects of the page contain options as well. */
const suggestion = (page: Page, name?: RegExp) =>
  page
    .getByRole("listbox", { name: "Adressvorschläge" })
    .getByRole("option", name ? { name } : undefined);

const countHeading = (page: Page, text: string) =>
  page.locator(".location-list-heading h2", { hasText: new RegExp(`^${text}$`) });

async function mapReady(page: Page) {
  await expect(page.locator('.wc-map-shell[data-map-status="ready"]')).toBeVisible();
  await page.waitForFunction(() => {
    const map = (window as unknown as { __wohncheckMap?: { loaded(): boolean } })
      .__wohncheckMap;
    return !!map && map.loaded();
  });
}

/** What the map source currently holds: every point exactly once, clustered or not. */
function mapState(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __wohncheckMap: {
          querySourceFeatures(source: string): Array<{
            properties: Record<string, unknown>;
            geometry: { coordinates: [number, number] };
          }>;
          getZoom(): number;
          getFilter(layer: string): unknown[];
        };
      }
    ).__wohncheckMap;
    const clusters = new Map<
      number,
      { count: number; coordinates: [number, number] }
    >();
    const singles = new Set<string>();
    for (const feature of map.querySourceFeatures("places")) {
      if (feature.properties.cluster)
        clusters.set(Number(feature.properties.cluster_id), {
          count: Number(feature.properties.point_count),
          coordinates: feature.geometry.coordinates,
        });
      else singles.add(String(feature.properties.id));
    }
    const clusterList = [...clusters.values()];
    return {
      total: clusterList.reduce((sum, c) => sum + c.count, 0) + singles.size,
      singles: [...singles].sort(),
      clusters: clusterList,
      zoom: map.getZoom(),
      selected: String(map.getFilter("poi-selected")[2]),
    };
  });
}

async function clickOnMap(page: Page, longitude: number, latitude: number) {
  const point = await page.evaluate(
    ([lon, lat]) => {
      const map = (
        window as unknown as {
          __wohncheckMap: { project(c: [number, number]): { x: number; y: number } };
        }
      ).__wohncheckMap;
      const p = map.project([lon, lat]);
      return { x: p.x, y: p.y };
    },
    [longitude, latitude],
  );
  const canvas = page.locator(".wc-map .maplibregl-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function zoomTo(page: Page, zoom: number) {
  await page.evaluate(
    ([lon, lat, z]) =>
      new Promise<void>((resolve) => {
        const map = (
          window as unknown as {
            __wohncheckMap: {
              once(event: string, cb: () => void): void;
              jumpTo(o: { center: [number, number]; zoom: number }): void;
            };
          }
        ).__wohncheckMap;
        map.once("idle", () => resolve());
        map.jumpTo({ center: [lon, lat], zoom: z });
      }),
    [CENTER.longitude, CENTER.latitude, zoom],
  );
}

test.describe("address", () => {
  test("suggestion with house number opens the check and survives a reload", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/check");
    await addressInput(page).fill("Kaiser-Wilhelm-Straße 103");
    const option = suggestion(page).first();
    await expect(option).toContainText("Hausnummer bestätigt");
    await option.click();
    await expect(page).toHaveURL(/lat=52\.438/);
    await expect(page).toHaveURL(/houseNumber=103/);
    await expect(
      page.getByRole("heading", { name: address.label, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Keine bestätigte Hausnummer")).toHaveCount(0);
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await page.reload();
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await expect(addressInput(page)).toHaveValue(address.label);
  });

  test("suggestions wait for three characters and ignore outdated answers", async ({
    page,
  }) => {
    await setup(page);
    const asked: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith("/address-suggestions"))
        asked.push(url.searchParams.get("q") ?? "");
    });
    await page.goto("/check");
    const input = addressInput(page);
    await input.fill("Ka");
    await page.waitForTimeout(600);
    expect(asked).toEqual([]);
    // Typed quickly: only the final text is requested after the 350 ms pause.
    await input.pressSequentially("iser-Wilhelm", { delay: 20 });
    await expect(suggestion(page)).toHaveCount(1);
    expect(asked).toEqual(["Kaiser-Wilhelm"]);
  });

  test("street without house number is marked as unconfirmed", async ({ page }) => {
    await setup(page);
    await page.goto("/check");
    await addressInput(page).fill("Kaiser-Wilhelm-Straße, Berlin");
    const option = suggestion(page).first();
    await expect(option).toContainText("Hausnummer nicht bestätigt");
    await option.click();
    await expect(page).toHaveURL(/accuracy=street/);
    expect(new URL(page.url()).searchParams.has("houseNumber")).toBe(false);
    await expect(page.getByText("Keine bestätigte Hausnummer.")).toBeVisible();
    await expect(page.locator(".location-accuracy")).toContainText("Straße");
  });

  test("submitting a unique address resolves it, an invalid one explains itself", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/check");
    const input = addressInput(page);
    await input.fill("INVALID 99");
    await input.press("Enter");
    await expect(
      page.getByText("Diese Adresse konnte nicht gefunden werden.", { exact: false }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/check$/);
    await input.fill("Zweite Straße 2");
    await input.press("Enter");
    await expect(page).toHaveURL(/lat=52\.53/);
    await expect(
      page.getByRole("heading", { name: second.label, exact: true }),
    ).toBeVisible();
  });

  test("ambiguous submitted address offers a choice instead of picking one", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/check");
    const input = addressInput(page);
    await input.fill("Hauptstraße 5");
    await input.press("Enter");
    await expect(page.getByText("Bitte wähle die passende Adresse aus.")).toBeVisible();
    await expect(suggestion(page)).toHaveCount(2);
    await expect(page).toHaveURL(/\/check$/);
    await suggestion(page, /Zweite Straße 2/).click();
    await expect(page).toHaveURL(/lat=52\.53/);
  });

  test("links with free text: unique is resolved, ambiguous asks, unknown explains", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/check?address=" + encodeURIComponent("Zweite Straße 2"));
    await expect(page).toHaveURL(/lat=52\.53/);
    await expect(countHeading(page, "3 Orte")).toBeVisible();

    await page.goto("/check?address=" + encodeURIComponent("Hauptstraße 5"));
    const candidates = page.locator(".location-candidates");
    await expect(candidates).toContainText("ist nicht eindeutig");
    await expect(candidates.getByRole("button")).toHaveCount(2);
    expect(new URL(page.url()).searchParams.has("lat")).toBe(false);
    await candidates.getByRole("button", { name: /Kaiser-Wilhelm-Straße 103/ }).click();
    await expect(page).toHaveURL(/lat=52\.438/);

    await page.goto("/check?address=INVALID");
    await expect(page.getByRole("alert")).toContainText("konnte nicht als Adresse");
  });

  test("links with invalid coordinates do not start an analysis", async ({ page }) => {
    await setup(page);
    let nearby = 0;
    page.on("request", (r) => {
      if (r.url().includes("nearby-places")) nearby++;
    });
    await page.goto("/check?address=INVALID&lat=999&lng=13.3");
    await expect(page.getByRole("alert")).toContainText("konnte nicht als Adresse");
    expect(nearby).toBe(0);
  });

  test("switching the address quickly never shows the old surroundings", async ({
    page,
  }) => {
    const first: Fixture = { ...bus, id: "a", name: "Ort der ersten Adresse" };
    const other: Fixture = { ...bus, id: "b", name: "Ort der zweiten Adresse" };
    await setup(page, {
      nearby: async (route, url) => {
        const isFirst = url.searchParams.get("lat") === String(CENTER.latitude);
        // The first address answers late, after the second one has already been chosen.
        await new Promise((resolve) => setTimeout(resolve, isFirst ? 2500 : 700));
        return route
          .fulfill({
            json: {
              ...nearbyBody([isFirst ? first : other], 1000),
              center: isFirst
                ? CENTER
                : { latitude: second.latitude, longitude: second.longitude },
            },
          })
          .catch(() => undefined);
      },
    });
    await page.goto(checkUrl());
    await addressInput(page).fill("Zweite Straße 2");
    await suggestion(page).first().click();
    await expect(
      page.getByRole("heading", { name: second.label, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Orte werden geladen …")).toBeVisible();
    await expect(page.getByText(first.name)).toHaveCount(0);
    await expect(page.getByRole("button", { name: new RegExp(other.name) })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(page.getByText(first.name)).toHaveCount(0);
    await expect(countHeading(page, "1 Ort")).toBeVisible();
  });
});

test.describe("filters, radius and list", () => {
  test("single and multiple filters work on loaded data without new requests", async ({
    page,
  }) => {
    await setup(page);
    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("nearby-places")) calls++;
    });
    await page.goto(checkUrl());
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    const category = (name: string) =>
      page.getByRole("button", { name, exact: true });

    await category("ÖPNV").click();
    await expect(countHeading(page, "2 Orte")).toBeVisible();
    await expect(page.getByText("Filtertreffer von 3 erfassten Orten")).toBeVisible();
    await expect(page).toHaveURL(/categories=/);

    // Only one category: the pharmacy belongs to health and shopping and is listed once.
    await category("Alle").click();
    for (const name of ["ÖPNV", "Bildung", "Freizeit", "Gastronomie", "Infrastruktur", "Einkaufen"])
      await category(name).click();
    await expect(countHeading(page, "1 Ort")).toBeVisible();
    await expect(page.getByRole("button", { name: /Test-Apotheke/ })).toBeVisible();

    await category("Einkaufen").click();
    await expect(countHeading(page, "2 Orte")).toBeVisible();
    await expect(page.getByRole("button", { name: /Test-Apotheke/ })).toHaveCount(1);

    // Subcategory inside shopping; health stays unrestricted.
    await page.getByText("Unterkategorien", { exact: false }).first().click();
    const shopping = page.getByRole("group", { name: "Einkaufen" });
    await shopping.getByLabel(/Supermarkt/).check();
    await expect(page).toHaveURL(/kinds=supermarket/);
    await expect(countHeading(page, "2 Orte")).toBeVisible();
    await category("Gesundheit").click();
    await expect(countHeading(page, "1 Ort")).toBeVisible();
    await expect(page.getByRole("button", { name: /Test-Supermarkt/ })).toBeVisible();

    // Everything off: a clear empty state with a way back.
    await category("Einkaufen").click();
    await expect(countHeading(page, "0 Orte")).toBeVisible();
    await expect(
      page.getByText("Kein erfasster Ort entspricht den gewählten Filtern."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    expect(new URL(page.url()).searchParams.has("categories")).toBe(false);

    // The summary always describes everything that was loaded.
    await category("ÖPNV").click();
    await expect(
      page.locator('.location-summary [data-category="transit"] strong'),
    ).toHaveText("1");
    expect(calls).toBe(1);
  });

  test("filters and radius are restored from the URL and the browser history", async ({
    page,
  }) => {
    await setup(page);
    await page.goto(
      checkUrl(address, { radius: "2000", categories: "transit,shopping", kinds: "bus" }),
    );
    await expect(page.getByLabel("Suchradius")).toHaveValue("2000");
    await expect(page.getByRole("button", { name: "ÖPNV", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Gesundheit", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await page.getByRole("button", { name: "Einkaufen", exact: true }).click();
    await expect(countHeading(page, "1 Ort")).toBeVisible();
    await page.goBack();
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await page.goForward();
    await expect(countHeading(page, "1 Ort")).toBeVisible();
    await page.reload();
    await expect(countHeading(page, "1 Ort")).toBeVisible();
    await expect(page.getByLabel("Suchradius")).toHaveValue("2000");
  });

  test("every radius loads, keeps the URL and flags uncovered figures", async ({
    page,
  }) => {
    await setup(page);
    await page.goto(checkUrl());
    for (const radius of ["500", "2000", "5000", "1000"]) {
      await page.getByLabel("Suchradius").selectOption(radius);
      if (radius === "1000")
        expect(new URL(page.url()).searchParams.has("radius")).toBe(false);
      else await expect(page).toHaveURL(new RegExp(`radius=${radius}`));
      await expect(countHeading(page, "3 Orte")).toBeVisible();
      const transit = page.locator('.location-summary [data-category="transit"]');
      await expect(transit).toContainText(
        radius === "500" ? /bis 1 km\s*nicht im Radius/ : /bis 1 km\s*1/,
      );
      await expect(transit).toContainText(/bis 500 m\s*1/);
    }
    // The address stays the centre of every request.
    await expect(page).toHaveURL(/lat=52\.438/);
  });

  test("a radius change keeps the old places, marked as the previous state", async ({
    page,
  }) => {
    await setup(page, {
      nearby: async (route, url) => {
        const radius = Number(url.searchParams.get("radius"));
        if (radius === 2000) await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({
          json: nearbyBody(radius === 2000 ? [...base, ...cafes] : base, radius),
        });
      },
    });
    await page.goto(checkUrl());
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await page.getByLabel("Suchradius").selectOption("2000");
    await expect(page.locator(".location-previous-label")).toHaveText(
      "Vorheriger Stand · Radius 1 km",
    );
    await expect(page.getByRole("button", { name: /Test-Supermarkt/ })).toBeVisible();
    await expect(countHeading(page, "15 Orte")).toBeVisible();
    await expect(page.locator(".location-previous-label")).toHaveCount(0);
  });

  test("grouping by category and step-wise rendering keep the total visible", async ({
    page,
  }) => {
    const many: Fixture[] = Array.from({ length: 130 }, (_, i) => ({
      ...bus,
      id: `osm:node:${1000 + i}`,
      name: `Halt ${String(i + 1).padStart(3, "0")}`,
      distanceMeters: 10 + i,
    }));
    await setup(page, { places: [...many, shop, pharmacy] });
    await page.goto(checkUrl());
    await expect(countHeading(page, "132 Orte")).toBeVisible();
    const items = page.locator(".location-places-panel li");
    await expect(items).toHaveCount(60);
    await expect(items.first()).toContainText("Halt 001");
    await expect(page.getByText("60 von 132 Orten angezeigt")).toBeVisible();
    await page.getByRole("button", { name: "Weitere Orte anzeigen" }).click();
    await expect(items).toHaveCount(120);
    await page.getByRole("button", { name: "Weitere Orte anzeigen" }).click();
    await expect(items).toHaveCount(132);
    await expect(page.getByRole("button", { name: "Weitere Orte anzeigen" })).toHaveCount(0);

    // Grouped: every category is visible at once, each with its own total and its own steps.
    await page.getByLabel("Sortierung der Liste").selectOption("category");
    const headings = page.locator(".location-list-group h3");
    await expect(headings).toHaveText(["ÖPNV · 130", "Einkaufen · 1", "Gesundheit · 1"]);
    await expect(countHeading(page, "132 Orte")).toBeVisible();
    const transitGroup = page.locator(".location-list-group").first();
    await expect(transitGroup.locator("li")).toHaveCount(20);
    await expect(transitGroup.locator("li").first()).toContainText("Halt 001");
    await expect(transitGroup).toContainText("20 von 130 Orten in ÖPNV angezeigt");
    await expect(page.getByRole("button", { name: /Test-Apotheke/ })).toBeVisible();
    await transitGroup.getByRole("button", { name: /Weitere Orte anzeigen/ }).click();
    await expect(transitGroup.locator("li")).toHaveCount(40);
  });
});

test.describe("states", () => {
  const failing = (status: number, code?: string, extra = {}) => ({
    nearby: (route: Route) =>
      route.fulfill({
        status,
        json: { statusCode: status, message: "Fehler", ...(code ? { code } : {}), ...extra },
      }),
  });

  test("timeout, quota, rate limit and missing configuration are told apart", async ({
    page,
  }) => {
    await setup(page, failing(504, "TIMEOUT"));
    await page.goto(checkUrl());
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Zeitüberschreitung");
    await expect(alert.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await expect(page.getByText("Es liegen keine Umgebungsdaten vor.")).toBeVisible();

    await page.unrouteAll();
    await setup(page, failing(503, "QUOTA", { retryAfterSeconds: 600 }));
    await page.goto(checkUrl());
    await expect(alert).toContainText("Kontingent ausgeschöpft");
    await expect(alert).toContainText("10 Minuten");

    await page.unrouteAll();
    await setup(page, failing(429));
    await page.goto(checkUrl());
    await expect(alert).toContainText("Zu viele Anfragen");

    await page.unrouteAll();
    await setup(page, failing(503, "NOT_CONFIGURED"));
    await page.goto(checkUrl());
    await expect(alert).toContainText("Standortsuche nicht eingerichtet");
    await expect(alert).toContainText("keine Beispieldaten");
    await expect(alert.getByRole("button")).toHaveCount(0);
    await expect(page.locator(".location-places-panel li")).toHaveCount(0);
  });

  test("a retry after a failure loads the surroundings", async ({ page }) => {
    let attempts = 0;
    await setup(page, {
      nearby: (route, url) =>
        ++attempts === 1
          ? route.fulfill({ status: 504, json: { message: "x", code: "TIMEOUT" } })
          : route.fulfill({
              json: nearbyBody(base, Number(url.searchParams.get("radius"))),
            }),
    });
    await page.goto(checkUrl());
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("partial data is labelled and the missing category can be reloaded", async ({
    page,
  }) => {
    let attempts = 0;
    await setup(page, {
      nearby: (route) => {
        const complete = nearbyBody(base, 1000);
        if (++attempts > 1) return route.fulfill({ json: complete });
        return route.fulfill({
          json: nearbyBody([bus, shop], 1000, {
            incomplete: ["health", "leisure"],
            issues: [
              { category: "health", reason: "timeout" },
              { category: "leisure", reason: "limit" },
            ],
            metrics: {
              ...complete.metrics,
              health: {
                status: "unavailable",
                total: 0,
                nearestDistance: null,
                count500m: null,
                count500mStatus: "unavailable",
                count1000m: null,
                count1000mStatus: "unavailable",
                complete: false,
              },
              leisure: {
                status: "truncated",
                total: 500,
                nearestDistance: 40,
                count500m: 120,
                count500mStatus: "minimum",
                count1000m: 500,
                count1000mStatus: "minimum",
                complete: false,
              },
            },
          }),
        });
      },
    });
    await page.goto(checkUrl());
    const status = page.locator(".location-status", { hasText: "Unvollständige Daten" });
    await expect(status).toContainText("Gesundheit: nicht geladen (Zeitüberschreitung)");
    await expect(status).toContainText("Freizeit: Limit von 500 Orten erreicht");
    const summary = page.locator(".location-summary");
    await expect(summary.locator('[data-category="health"]')).toContainText(
      "Daten nicht verfügbar",
    );
    const leisure = summary.locator('[data-category="leisure"]');
    await expect(leisure.locator("strong")).toHaveText("500+");
    await expect(leisure).toContainText("erfasste Orte (Limit erreicht)");
    await expect(leisure).toContainText("mind. 120");
    await status.getByRole("button", { name: "Fehlende Kategorien erneut laden" }).click();
    await expect(status).toHaveCount(0);
    await expect(countHeading(page, "3 Orte")).toBeVisible();
  });

  test("stale data shows its date, an empty area is not an error", async ({ page }) => {
    await setup(page, {
      nearby: (route, url) =>
        route.fulfill({
          json:
            url.searchParams.get("radius") === "500"
              ? nearbyBody([], 500)
              : nearbyBody(base, 1000, { stale: true, fetchedAt: "2026-11-15T08:30:00Z" }),
        }),
    });
    await page.goto(checkUrl());
    const stale = page.locator(".location-status", { hasText: "Zwischengespeicherter Stand" });
    await expect(stale).toContainText("15.11.2026");
    await expect(stale.getByRole("button", { name: "Aktuelle Daten laden" })).toBeVisible();
    await page.getByLabel("Suchradius").selectOption("500");
    await expect(
      page.getByText("Im Umkreis von 500 m wurden keine Orte erfasst."),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("map", () => {
  test("loads external map resources only after consent", async ({ page }) => {
    await setup(page, { consent: null });
    let tileRequests = 0;
    page.on("request", (r) => {
      if (r.url().startsWith("https://tiles.openfreemap.org/")) tileRequests++;
    });
    await page.goto(checkUrl());
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
    expect(tileRequests).toBe(0);
    await page.getByRole("button", { name: "Karte aktivieren", exact: true }).click();
    await mapReady(page);
    await expect(page.locator(".wc-map-address")).toBeVisible();
    expect(tileRequests).toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await page.screenshot({ path: "artifacts/location/map-desktop.png", fullPage: true });
  });

  test("map and list show the same places for every filter", async ({ page }) => {
    await setup(page, { consent: true, places: [...base, ...cafes] });
    await page.goto(checkUrl());
    await mapReady(page);
    await expect(countHeading(page, "15 Orte")).toBeVisible();
    await expect.poll(async () => (await mapState(page)).total).toBe(15);

    await page.getByRole("button", { name: "Gastronomie", exact: true }).click();
    await expect(countHeading(page, "3 Orte")).toBeVisible();
    await expect.poll(async () => (await mapState(page)).total).toBe(3);

    await page.getByRole("button", { name: "Alle", exact: true }).click();
    await page.getByText("Unterkategorien", { exact: false }).first().click();
    await page.getByRole("group", { name: "ÖPNV" }).getByLabel(/Tram/).check();
    await expect(countHeading(page, "14 Orte")).toBeVisible();
    await expect.poll(async () => (await mapState(page)).total).toBe(14);

    // Unclustered, the marker ids are exactly the ids of the list.
    await page.getByRole("button", { name: "Alle", exact: true }).click();
    for (const name of ["Gastronomie", "Bildung", "Freizeit", "Infrastruktur"])
      await page.getByRole("button", { name, exact: true }).click();
    await zoomTo(page, 17);
    await expect
      .poll(async () => (await mapState(page)).singles)
      .toEqual(base.map((p) => p.id).sort());
    await expect(page.locator(".location-places-panel li")).toHaveCount(3);
  });

  test("a cluster opens by zooming until its places are separate markers", async ({
    page,
  }) => {
    await setup(page, { consent: true, places: [...base, ...cafes] });
    await page.goto(checkUrl());
    await mapReady(page);
    await expect.poll(async () => (await mapState(page)).total).toBe(15);
    const before = await mapState(page);
    const cluster = [...before.clusters].sort((a, b) => b.count - a.count)[0];
    expect(cluster.count).toBeGreaterThanOrEqual(12);
    expect(before.singles.filter((id) => cafes.some((c) => c.id === id))).toEqual([]);

    await clickOnMap(page, cluster.coordinates[0], cluster.coordinates[1]);
    await expect.poll(async () => (await mapState(page)).zoom).toBeGreaterThan(before.zoom + 0.5);
    // Repeated clicks on the remaining clusters end with every café as its own marker.
    for (let step = 0; step < 6; step++) {
      const state = await mapState(page);
      const next = state.clusters.sort((a, b) => b.count - a.count)[0];
      if (!next) break;
      const zoom = state.zoom;
      await clickOnMap(page, next.coordinates[0], next.coordinates[1]);
      await expect.poll(async () => (await mapState(page)).zoom).toBeGreaterThan(zoom);
      await page.waitForTimeout(400);
    }
    const after = await mapState(page);
    expect(after.clusters).toEqual([]);
    expect(after.singles.filter((id) => cafes.some((c) => c.id === id)).length).toBeGreaterThan(0);
    // The data is unchanged: zooming never reloads or moves the search centre.
    await expect(countHeading(page, "15 Orte")).toBeVisible();
    await expect(page).toHaveURL(/lat=52\.438/);
  });

  test("marker and list entry select the same place with the same details", async ({
    page,
  }) => {
    await setup(page, { consent: true });
    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("nearby-places")) calls++;
    });
    await page.goto(checkUrl());
    await mapReady(page);
    await zoomTo(page, 16.6);
    const details = page.getByRole("region", { name: "Test-Haltestelle" });

    await clickOnMap(page, bus.longitude, bus.latitude);
    await expect(details).toBeVisible();
    await expect(details).toContainText("111 m Luftlinie");
    await expect(page.getByRole("button", { name: /Test-Haltestelle/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect((await mapState(page)).selected).toBe(bus.id);

    await page.getByRole("button", { name: /Test-Supermarkt/ }).click();
    const market = page.getByRole("region", { name: "Test-Supermarkt" });
    await expect(market).toContainText("222 m Luftlinie");
    await expect(market).toContainText("Testweg 5, 12247 Berlin");
    await expect(market).toContainText("Mo-Sa 07:00-22:00");
    await expect(market.getByRole("link", { name: /Originaleintrag/ })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/node/2",
    );
    await expect(details).toHaveCount(0);
    await expect.poll(async () => (await mapState(page)).selected).toBe(shop.id);
    // No ratings and no walking times are shown anywhere.
    await expect(market).not.toContainText(/Gehzeit|Minuten|Sterne|★/);

    // A filter that keeps the place keeps the selection; one that hides it closes it.
    await page.getByRole("button", { name: "ÖPNV", exact: true }).click();
    await expect(market).toBeVisible();
    await page.getByRole("button", { name: "Einkaufen", exact: true }).click();
    await expect(market).toHaveCount(0);
    await expect.poll(async () => (await mapState(page)).selected).toBe("");

    // Moving and zooming the map never requests data or changes the centre.
    await zoomTo(page, 12);
    await page.mouse.move(400, 500);
    expect(calls).toBe(1);
    await expect(page).toHaveURL(/lat=52\.438/);
  });

  test("without WebGL the complete list stays usable", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type.includes("webgl")) return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await setup(page, { consent: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(checkUrl());
    const notice = page.getByRole("alert").filter({ hasText: "Karte nicht verfügbar" });
    await expect(notice).toContainText("WebGL");
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
    // No view switch is needed: the list is shown right away, also on a phone.
    await expect(page.getByRole("group", { name: "Ansicht" })).toHaveCount(0);
    await expect(page.locator(".location-places-panel li")).toHaveCount(3);
    await page.getByRole("button", { name: /Test-Supermarkt/ }).click();
    await expect(page.getByRole("region", { name: "Test-Supermarkt" })).toBeVisible();
    await page.getByRole("button", { name: "ÖPNV", exact: true }).click();
    await expect(countHeading(page, "2 Orte")).toBeVisible();
  });

  test("a map style that cannot be loaded falls back to the list", async ({ page }) => {
    await setup(page, { consent: true });
    await page.route("https://tiles.openfreemap.org/styles/**", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.goto(checkUrl());
    const notice = page.getByRole("alert").filter({ hasText: "Karte nicht verfügbar" });
    await expect(notice).toBeVisible({ timeout: 15000 });
    await expect(notice.getByRole("button", { name: "Karte erneut laden" })).toBeVisible();
    await expect(page.locator(".location-places-panel li")).toHaveCount(3);
  });
});

test.describe("mobile and keyboard", () => {
  test("phone: map and list switch, details and no horizontal scrolling", async ({
    page,
  }) => {
    await setup(page, { consent: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(checkUrl());
    await mapReady(page);
    const mapBox = (await page.locator(".wc-map").boundingBox())!;
    expect(mapBox.height).toBeGreaterThanOrEqual(360);
    await expect(page.locator(".location-places-panel")).toBeHidden();
    await page.getByRole("button", { name: "Liste (3)", exact: true }).click();
    await expect(page.locator(".wc-map")).toBeHidden();
    await page.getByRole("button", { name: /Test-Supermarkt/ }).click();
    // Choosing a place returns to the map with its details.
    await expect(page.getByRole("region", { name: "Test-Supermarkt" })).toBeVisible();
    await expect(page.locator(".wc-map")).toBeVisible();
    // Categories scroll horizontally inside their row, the page itself does not.
    const filters = page.locator(".location-category-buttons");
    expect(await filters.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({ path: "artifacts/location/mobile.png", fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  });

  test("the whole flow works with the keyboard and focus stays visible", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/check");
    const input = addressInput(page);
    await input.focus();
    await page.keyboard.type("Kaiser-Wilhelm-Straße 103");
    await expect(suggestion(page)).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
    await expect(suggestion(page).first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/lat=52\.438/);
    await expect(countHeading(page, "3 Orte")).toBeVisible();

    const transit = page.getByRole("button", { name: "ÖPNV", exact: true });
    await transit.focus();
    expect(
      await transit.evaluate((el) => getComputedStyle(el).outlineStyle !== "none"),
    ).toBe(true);
    await page.keyboard.press("Space");
    await expect(transit).toHaveAttribute("aria-pressed", "false");
    await expect(countHeading(page, "2 Orte")).toBeVisible();

    const entry = page.getByRole("button", { name: /Test-Supermarkt/ });
    await entry.focus();
    await page.keyboard.press("Enter");
    const details = page.getByRole("region", { name: "Test-Supermarkt" });
    await expect(details).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Details schließen" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(details).toHaveCount(0);
    await expect(entry).toBeFocused();

    // Screen reader texts: result count is announced, the map has a name.
    await expect(
      page.getByText("2 von 3 erfassten Orten entsprechen den Filtern."),
    ).toHaveCount(1);
  });

  test("reduced motion: selecting a place moves the map without animation", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page, { consent: true });
    await page.goto(checkUrl());
    await mapReady(page);
    await page.getByRole("button", { name: /Test-Haltestelle/ }).click();
    // With a zero-length animation the target zoom is reached within the same frame.
    await expect.poll(async () => (await mapState(page)).zoom).toBeGreaterThanOrEqual(17);
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { __wohncheckMap: { isMoving(): boolean } }
        ).__wohncheckMap.isMoving(),
      ),
    ).toBe(false);
  });
});

test.describe("integration", () => {
  test("the central search offers real addresses next to directory hits", async ({
    page,
  }) => {
    await setup(page);
    await page.route("**/api/search?**", (route) =>
      route.fulfill({
        json: {
          landlords: [
            {
              id: "l-test",
              slug: "l-test",
              name: "Kaiser Wohnen GmbH",
              companyType: "Hausverwaltung",
              city: "Berlin",
            },
          ],
          properties: [],
          neighborhoods: [],
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("combobox").fill("Kaiser-Wilhelm-Straße 103");
    const landlord = page.getByRole("option", { name: /Kaiser Wohnen GmbH/ });
    const place = page.getByRole("option", { name: /Umgebung prüfen/ });
    await expect(landlord).toBeVisible();
    await expect(place).toContainText(address.label);
    await place.click();
    await expect(page).toHaveURL(/\/check\?.*lat=52\.438/);
    await expect(countHeading(page, "3 Orte")).toBeVisible();

    // A directory hit keeps its existing target.
    await page.goto("/");
    await page.getByRole("combobox").fill("Kaiser");
    await page.getByRole("option", { name: /Kaiser Wohnen GmbH/ }).click();
    await expect(page).toHaveURL(/\/vermieter\/l-test$/);
  });

  test("a submitted search is geocoded and offers the address check", async ({
    page,
  }) => {
    await setup(page);
    await page.route("**/api/search?**", (route) =>
      route.fulfill({ json: { landlords: [], properties: [], neighborhoods: [] } }),
    );
    await page.goto("/suche?q=" + encodeURIComponent("Hauptstraße 5"));
    const matches = page.locator(".address-matches");
    await expect(matches).toContainText("Mehrere passende Adressen");
    await expect(matches.getByRole("link")).toHaveCount(2);
    await expect(page).toHaveURL(/\/suche/);
    await matches.getByRole("link", { name: /Zweite Straße 2/ }).click();
    await expect(page).toHaveURL(/\/check\?.*lat=52\.53/);
  });

  test("directory views show their object markers on the same map renderer", async ({
    page,
  }) => {
    await setup(page, { consent: true });
    await page.route("**/api/search?**", (route) =>
      route.fulfill({
        json: {
          landlords: [],
          properties: [
            {
              id: "p1",
              slug: "p1",
              street: "Kastanienallee",
              houseNumber: "12",
              postalCode: "10435",
              city: "Berlin",
              landlordId: "l1",
            },
          ],
          neighborhoods: [
            { id: "n1", slug: "n1", districtName: "Prenzlauer Berg", city: "Berlin", postalCode: "10435" },
          ],
        },
      }),
    );
    await page.goto("/suche?q=Berlin");
    await page.getByText("Karte der Wohnorte anzeigen", { exact: true }).click();
    await expect(page.locator('.wc-map-shell[data-map-status="ready"]')).toBeVisible();
    const marker = page.getByRole("button", { name: "Gebäude Kastanienallee 12, 10435 Berlin" });
    await expect(marker).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Wohngegend Prenzlauer Berg, Berlin" }),
    ).toBeVisible();
    await marker.focus();
    await page.keyboard.press("Enter");
    await expect(marker).toHaveAttribute("aria-pressed", "true");
    const selection = page.locator(".object-map-selection");
    await expect(selection.getByRole("link", { name: "Zum Gebäude" })).toHaveAttribute(
      "href",
      "/gebaeude/p1",
    );
    await selection.getByRole("link", { name: "Umgebung dieser Adresse prüfen" }).click();
    await expect(page).toHaveURL(/\/check\?/);
  });
});

test("live Berlin address uses the configured provider and real map tiles", async ({
  page,
}) => {
  test.skip(
    !process.env.LOCATION_LIVE_TEST,
    "Opt in with LOCATION_LIVE_TEST=1; needs GEOAPIFY_API_KEY and consumes provider credits.",
  );
  test.setTimeout(120000);
  await page.addInitScript(() =>
    localStorage.setItem(
      "wohnweise-consent-v1",
      JSON.stringify({ essential: true, externalMedia: true }),
    ),
  );
  const response = page.waitForResponse(
    (r) => r.url().includes("/nearby-places?") && r.status() === 200,
    { timeout: 90000 },
  );
  await page.goto(
    "/check?address=" + encodeURIComponent("Kaiser-Wilhelm-Straße 103, 12247 Berlin"),
  );
  const data = await (await response).json();
  expect(data.places.length).toBeGreaterThan(20);
  expect(data.places.every((p: { distanceMeters: number }) => p.distanceMeters <= 1000)).toBe(
    true,
  );
  expect(new Set(data.places.map((p: { id: string }) => p.id)).size).toBe(data.places.length);
  expect(data.issues.filter((i: { reason: string }) => i.reason !== "limit")).toEqual([]);
  await expect(page).toHaveURL(/houseNumber=103/);
  await expect(page.locator(".wc-map-address")).toBeVisible();
  await expect(page.locator(".location-list-heading h2")).toContainText(
    String(data.places.length),
  );
  await mapReady(page);
  await expect.poll(async () => (await mapState(page)).total).toBe(data.places.length);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "artifacts/location/live-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "artifacts/location/live-mobile.png", fullPage: true });
});
