import { test, expect, Page } from "@playwright/test";

/**
 * Browser tests of the landlord directory UI with deterministic API answers (no backend data needed).
 * The real data path (import, search, lookup) is covered by backend/test/landlord-directory.int-spec.ts.
 */

const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, slug: id, name, kind: "HOUSING_COMPANY", kindLabel: "Wohnungsgesellschaft", companyType: "Wohnungsgesellschaft",
  city: "Bochum", state: "DE-NW", stateLabel: "Nordrhein-Westfalen", website: "https://www.vonovia.de/",
  verificationStatus: "AUTO_VERIFIED", verificationLabel: "Automatisch verifiziert", operationalStatus: "OPERATING",
  ratingOverall: null, reviewCount: 0, ...extra,
});
const vonovia = card("ll-vonovia", "Vonovia");
const privata = card("ll-privata", "Privata Hausverwaltung GmbH", { kind: "PROPERTY_MANAGER", kindLabel: "Hausverwaltung", city: "Berlin", website: null });
const ref = (l: typeof vonovia) => ({ id: l.id, slug: l.slug, name: l.name, kindLabel: l.kindLabel, city: l.city });

const verifiedLookup = {
  address: { street: "Kaiser-Wilhelm-Straße", houseNumber: "103", postalCode: "12247", city: "Berlin" },
  status: "verified", reason: null, property: { id: "pp-1", slug: "kaiser-wilhelm-strasse-103" },
  parties: [
    { role: "LANDLORD", roleLabel: "Vermieter", landlord: ref(vonovia), status: "current", statusLabel: "Bestätigt", validFrom: "2020-01-01T00:00:00.000Z", validTo: null, unitLabel: null, lastCheckedAt: null },
    { role: "MANAGER", roleLabel: "Hausverwaltung", landlord: ref(privata), status: "current", statusLabel: "Bestätigt", validFrom: null, validTo: null, unitLabel: null, lastCheckedAt: null },
  ],
  formerParties: [], openReports: 0, message: "Für diese Immobilie ist eine geprüfte Zuordnung hinterlegt.",
  checkedStages: [{ stage: 1, label: "Bestätigte Zuordnung bei WohnCheck", result: "match" }],
};
const emptyLookup = {
  ...verifiedLookup, status: "none", reason: "unknown_building", property: null, parties: [], openReports: 1,
  message: "Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.",
  checkedStages: [
    { stage: 1, label: "Bestätigte Zuordnung bei WohnCheck", result: "no_match" },
    { stage: 2, label: "Veröffentlichte Wohnungsbestände", result: "not_available" },
    { stage: 3, label: "Weitere öffentliche Quellen", result: "not_available" },
    { stage: 4, label: "Meldungen von Nutzern", result: "match" },
  ],
};

async function mockCommon(page: Page) {
  await page.route("**/api/reviews?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reviews/aggregate/**", (route) => route.fulfill({ json: { reviewCount: 0, overallRating: null, categoryRatings: {} } }));
  await page.route("**/api/scores/**", (route) => route.fulfill({ status: 404, json: { message: "x" } }));
  await page.route("**/api/data-sources/**", (route) => route.fulfill({ json: { links: [], available: false, sources: [], suggestions: [] } }));
}

test("search finds companies, shows kind and city, and offers the open-source search on a miss", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/search?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    return route.fulfill({
      json: q === "Zzyzx GmbH"
        ? { query: q, landlords: [], properties: [], neighborhoods: [], discoveryEligible: true }
        : { query: q, landlords: [{ ...vonovia, matchedAlias: "Deutsche Annington" }], properties: [], neighborhoods: [], discoveryEligible: false },
    });
  });
  let discoveryBody: unknown;
  await page.route("**/api/discovery/requests", async (route) => {
    discoveryBody = route.request().postDataJSON();
    await route.fulfill({ json: { id: null, status: "NOT_FOUND", message: "In Wikidata und GLEIF wurde kein passendes Unternehmen gefunden.", landlords: [], pollAfterMs: null, completedAt: null } });
  });
  await page.goto("/suche?q=Deutsche%20Annington&type=landlord");
  const row = page.locator(".directory-row", { hasText: "Vonovia" });
  await expect(row).toContainText("Wohnungsgesellschaft · Bochum");
  await expect(row).toContainText("auch bekannt als Deutsche Annington");
  await expect(row).toContainText("Noch keine WohnCheck-Bewertungen");

  await page.goto("/suche?q=Zzyzx%20GmbH");
  // Never automatic: the term is only sent after the click.
  expect(discoveryBody).toBeUndefined();
  await page.getByRole("button", { name: "In offenen Quellen suchen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "kein passendes Unternehmen" })).toBeVisible();
  expect(discoveryBody).toEqual({ query: "Zzyzx GmbH" });
});

test("landlord profile shows identity, sources, buildings with roles and link-only external experiences", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/landlords/ll-vonovia", (route) => route.fulfill({
    json: { ...vonovia, redirectedFromId: null, listings: [], properties: [{
      id: "pp-1", street: "Kaiser-Wilhelm-Straße", houseNumber: "103", postalCode: "12247", city: "Berlin", slug: "x", landlordId: "ll-vonovia", neighborhoodId: null,
      roles: [verifiedLookup.parties[0]], ratingOverall: null, reviewCount: 0,
    }] },
  }));
  await page.route("**/api/landlords/ll-vonovia/profile", (route) => route.fulfill({
    json: {
      landlord: { ...vonovia, legalName: "Vonovia SE", legalForm: "SE", legalFormLabel: "SE", postalCode: "44803", operatingStates: [], verificationNotice: "Automatisch aus offenen Quellen erfasst, nicht redaktionell geprüft.", lastRefreshedAt: null },
      redirectedFromId: null,
      aliases: [{ name: "Deutsche Annington", type: "FORMER_NAME", typeLabel: "Früherer Name" }],
      identifiers: [{ scheme: "LEI", schemeLabel: "LEI", display: "5299005A2ZEP6AP7KM81", value: "5299005A2ZEP6AP7KM81", links: [{ label: "Bei GLEIF ansehen", url: "https://search.gleif.org/#/record/5299005A2ZEP6AP7KM81" }] }],
      relations: [{ type: "PARENT_OF", direction: "outgoing", label: "Tochtergesellschaft", other: { id: "ll-dw", slug: "dw", name: "Deutsche Wohnen SE", kindLabel: "Wohnungsgesellschaft", city: "Berlin" }, sourceKey: "wikidata" }],
      locations: [],
      sources: [{ sourceKey: "wikidata", displayName: "Wikidata", license: "CC0-1.0", licenseUrl: null, attribution: null, attributionUrl: null, note: null, recordCount: 1, recordUrls: ["https://www.wikidata.org/wiki/Q1202053"], firstSeenAt: "2026-11-18T10:00:00.000Z", lastSeenAt: "2026-11-18T10:00:00.000Z" }],
    },
  }));
  await page.route("**/api/landlords/ll-vonovia/external", (route) => route.fulfill({
    json: {
      landlordId: "ll-vonovia", redirectedFromId: null, disclaimer: "Externe Plattformen sind unabhängig von WohnCheck.",
      platforms: [{ platform: "trustpilot", displayName: "Trustpilot", mode: "link_only", notice: "Nur Links.", references: [], searchLinks: [{ label: "Auf Trustpilot suchen", url: "https://de.trustpilot.com/search?query=%22Vonovia%22" }] }],
      helpLinks: [{ label: "Mieterverein vor Ort finden", url: "https://mieterbund.de/mieterverein-vor-ort/" }],
    },
  }));
  await page.goto("/vermieter/ll-vonovia");
  await expect(page.getByRole("heading", { level: 1, name: "Vonovia" })).toBeVisible();
  await expect(page.getByText("Automatisch verifiziert")).toBeVisible();
  await expect(page.getByText("Automatisch aus offenen Quellen erfasst, nicht redaktionell geprüft.")).toBeVisible();
  await expect(page.getByText("5299005A2ZEP6AP7KM81")).toBeVisible();
  await expect(page.getByRole("link", { name: "Deutsche Wohnen SE" })).toHaveAttribute("href", "/vermieter/ll-dw");
  await expect(page.locator(".building-list")).toContainText("Kaiser-Wilhelm-Straße 103");
  await expect(page.locator(".building-list")).toContainText("Vermieter");
  const external = page.getByRole("link", { name: /Auf Trustpilot suchen/ });
  await expect(external).toHaveAttribute("href", "https://de.trustpilot.com/search?query=%22Vonovia%22");
  // No external rating appears anywhere.
  await expect(page.locator("section", { hasText: "Externe Erfahrungsberichte" })).not.toContainText(/★|Sterne|\/ 5/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("building without landlord says so and lets a logged-in user report one", async ({ page }) => {
  await mockCommon(page);
  await page.addInitScript(() => localStorage.setItem("wohncheck_auth", JSON.stringify({ accessToken: "ui-test-only" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { id: "u1", displayName: "Testnutzer", role: "USER", email: "test@example.invalid" } } }));
  await page.route("**/api/properties/pp-2", (route) => route.fulfill({
    json: { id: "pp-2", street: "Musterweg", houseNumber: "5", postalCode: "10115", city: "Berlin", slug: "musterweg-5", neighborhood: null, landlord: null, parties: [], formerParties: [], openReports: 0, ratingOverall: null, reviewCount: 0 },
  }));
  await page.route("**/api/search/suggest?*", (route) => route.fulfill({ json: { query: "priv", suggestions: [{ type: "landlord", id: "ll-privata", label: "Privata Hausverwaltung GmbH", sublabel: "Hausverwaltung · Berlin" }] } }));
  let report: Record<string, unknown> | undefined;
  await page.route("**/api/properties/reports", async (route) => {
    report = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "r1", status: "OPEN", message: "Danke! Deine Meldung ist eingegangen. Sie wird erst nach einer Prüfung durch WohnCheck als Zuordnung angezeigt." } });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/gebaeude/pp-2");
  await expect(page.getByText("Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.")).toBeVisible();
  await page.getByRole("button", { name: "Vermieter melden" }).click();
  await page.getByLabel("Hausverwaltung", { exact: true }).check();
  const picker = page.getByRole("combobox", { name: "Hausverwaltung" });
  await picker.fill("priv");
  await page.getByRole("option", { name: /Privata Hausverwaltung GmbH/ }).click();
  await expect(picker).toHaveValue("Privata Hausverwaltung GmbH");
  await page.getByRole("button", { name: "Meldung senden" }).click();
  await expect(page.getByText("Sie wird erst nach einer Prüfung durch WohnCheck als Zuordnung angezeigt.")).toBeVisible();
  expect(report).toMatchObject({ street: "Musterweg", houseNumber: "5", postalCode: "10115", city: "Berlin", role: "MANAGER", landlordId: "ll-privata" });
  expect(report?.organizationName).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("private landlord reports never carry a name, and anonymous users are asked to log in", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/properties/pp-2", (route) => route.fulfill({
    json: { id: "pp-2", street: "Musterweg", houseNumber: "5", postalCode: "10115", city: "Berlin", slug: "m", neighborhood: null, landlord: null, parties: [], formerParties: [], openReports: 0, ratingOverall: null, reviewCount: 0 },
  }));
  await page.goto("/gebaeude/pp-2");
  await page.getByRole("button", { name: "Vermieter melden" }).click();
  await expect(page.getByRole("link", { name: "Anmelden und melden" })).toBeVisible();

  await page.addInitScript(() => localStorage.setItem("wohncheck_auth", JSON.stringify({ accessToken: "ui-test-only" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { id: "u1", displayName: "Testnutzer", role: "USER", email: "test@example.invalid" } } }));
  let report: Record<string, unknown> | undefined;
  await page.route("**/api/properties/reports", async (route) => {
    report = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "r2", status: "OPEN", message: "Danke!" } });
  });
  await page.goto("/gebaeude/pp-2");
  await page.getByRole("button", { name: "Vermieter melden" }).click();
  await page.getByLabel(/Privatperson/).check();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByRole("button", { name: "Meldung senden" }).click();
  await expect(page.getByText("Danke!")).toBeVisible();
  expect(report).toMatchObject({ role: "LANDLORD", privateLandlord: true });
  expect(report?.landlordId).toBeUndefined();
  expect(report?.organizationName).toBeUndefined();
});

test("the address check shows verified roles, or says plainly that no landlord is known", async ({ page }) => {
  await mockCommon(page);
  let lookups = 0;
  await page.route("**/api/properties/lookup?*", (route) => {
    lookups++;
    const house = new URL(route.request().url()).searchParams.get("houseNumber");
    return route.fulfill({ json: house === "103" ? verifiedLookup : emptyLookup });
  });
  await page.route("**/api/data-sources/nearby-places?*", (route) => route.fulfill({ status: 503, json: { message: "x", code: "UNAVAILABLE" } }));
  const url = (houseNumber: string) => `/check?${new URLSearchParams({ address: `Kaiser-Wilhelm-Straße ${houseNumber}, 12247 Berlin`, lat: "52.4384", lng: "13.3496", accuracy: "building", street: "Kaiser-Wilhelm-Straße", houseNumber, postalCode: "12247", city: "Berlin" })}`;

  await page.goto(url("103"));
  const section = page.locator(".landlord-at-address");
  await expect(section.getByText("Vermieter", { exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: "Vonovia" })).toBeVisible();
  await expect(section.locator("dt", { hasText: "Hausverwaltung" })).toBeVisible();
  await expect(section.getByRole("link", { name: "Privata Hausverwaltung GmbH" })).toBeVisible();
  await expect(section).not.toContainText("Eigentümer");

  await page.goto(url("999"));
  await expect(section.getByText("Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.")).toBeVisible();
  await expect(section).toContainText("Eine ungeprüfte Meldung");
  await expect(section.getByRole("button", { name: "Vermieter melden" })).toBeVisible();
  expect(lookups).toBe(2);
});
