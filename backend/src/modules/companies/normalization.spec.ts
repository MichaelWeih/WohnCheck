import { IdentifierScheme } from "@prisma/client";
import {
  addressKey,
  canonicalIdentifier,
  classifyByName,
  looksLikeCompanyQuery,
  normalizeCompanyName,
  normalizeSearchText,
  normalizeStreet,
  orderedPair,
  registrableDomain,
  safeHttpUrl,
  slugifyCompany,
} from "./normalization";

describe("normalizeCompanyName", () => {
  it("folds the spellings of one company to the same key", () => {
    const keys = ["Vonovia", "Vonovia SE", "VONOVIA", "VONOVIA S.E.", "  vonovia  se "].map(
      (name) => normalizeCompanyName(name).normalized,
    );
    expect(new Set(keys)).toEqual(new Set(["vonovia"]));
    expect(normalizeCompanyName("Vonovia SE").legalForm).toBe("SE");
    expect(normalizeCompanyName("Vonovia").legalForm).toBeNull();
  });

  it("keeps distinguishing words, so a subsidiary stays different", () => {
    expect(normalizeCompanyName("Vonovia Immobilien Treuhand GmbH")).toMatchObject({
      normalized: "vonovia immobilien treuhand",
      legalForm: "GMBH",
    });
  });

  it("folds umlauts and ß and removes punctuation", () => {
    expect(normalizeCompanyName("Hausverwaltung Müller & Söhne GmbH").normalized).toBe(
      "hausverwaltung mueller und soehne",
    );
    expect(normalizeCompanyName("Großstadt-Wohnbau e.G.").normalized).toBe("grossstadt wohnbau");
  });

  it("recognises combined and written-out legal forms", () => {
    expect(normalizeCompanyName("Beispiel GmbH & Co. KG").legalForm).toBe("GMBH_CO_KG");
    expect(normalizeCompanyName("Gewobag Wohnungsbau-Aktiengesellschaft Berlin")).toMatchObject({
      normalized: "gewobag wohnungsbau berlin",
      legalForm: "AG",
    });
    expect(normalizeCompanyName("degewo AG").normalized).toBe("degewo");
    expect(normalizeCompanyName("Wohnungsbaugenossenschaft Aufbau eingetragene Genossenschaft").legalForm).toBe("EG");
  });

  it("treats Stiftung as legal form only at the end", () => {
    expect(normalizeCompanyName("Schmidt Stiftung")).toMatchObject({ normalized: "schmidt", legalForm: "STIFTUNG" });
    expect(normalizeCompanyName("Stiftung Liebenau").legalForm).toBeNull();
  });

  it("returns an empty core for a bare legal form", () => {
    expect(normalizeCompanyName("GmbH").normalized).toBe("");
  });
});

describe("normalizeSearchText", () => {
  it("keeps legal forms and city words for search", () => {
    expect(normalizeSearchText("Vonovia SE, Berlin")).toBe("vonovia se berlin");
    expect(normalizeSearchText("DEGEWO")).toBe("degewo");
  });
});

describe("URL and domain helpers", () => {
  it("accepts http(s) only and adds a scheme when missing", () => {
    expect(safeHttpUrl("vonovia.de")).toBe("https://vonovia.de/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("ftp://example.org")).toBeNull();
    expect(safeHttpUrl("https://user:pw@example.org")).toBeNull();
  });

  it("derives registrable domains and blocks shared ones", () => {
    expect(registrableDomain("https://www.vonovia.de/de-de/kontakt")).toBe("vonovia.de");
    expect(registrableDomain("https://example.co.uk/x")).toBe("example.co.uk");
    expect(registrableDomain("https://de-de.facebook.com/vonovia")).toBeNull();
    expect(registrableDomain(null)).toBeNull();
  });
});

describe("canonicalIdentifier", () => {
  it("canonicalises valid identifiers and drops invalid ones", () => {
    expect(canonicalIdentifier({ scheme: "LEI", value: "529900ce1gxc9zmqsi69" })).toEqual({
      scheme: IdentifierScheme.LEI,
      value: "529900CE1GXC9ZMQSI69",
    });
    expect(canonicalIdentifier({ scheme: "LEI", value: "123" })).toBeNull();
    expect(canonicalIdentifier({ scheme: "WIKIDATA", value: "http://www.wikidata.org/entity/Q1185412" })).toEqual({
      scheme: IdentifierScheme.WIKIDATA,
      value: "Q1185412",
    });
    expect(
      canonicalIdentifier({ scheme: "GERMAN_REGISTER", registerType: "HRB", number: "16879", courtCode: "R2201" }),
    ).toEqual({ scheme: IdentifierScheme.GERMAN_REGISTER, value: "R2201_HRB16879" });
    expect(
      canonicalIdentifier({ scheme: "GERMAN_REGISTER", registerType: "HRB", number: "16879", courtCode: "" }),
    ).toBeNull();
  });
});

describe("classifyByName", () => {
  it("separates strong, weak and missing housing evidence", () => {
    expect(classifyByName(normalizeCompanyName("Wohnungsbaugenossenschaft Aufbau eG"))).toEqual({
      relevance: "confirmed",
      kind: "COOPERATIVE",
    });
    expect(classifyByName(normalizeCompanyName("Hausverwaltung Müller GmbH"))).toEqual({
      relevance: "confirmed",
      kind: "PROPERTY_MANAGER",
    });
    expect(classifyByName(normalizeCompanyName("Gewobag Wohnungsbau-Aktiengesellschaft Berlin"))).toEqual({
      relevance: "confirmed",
      kind: "HOUSING_COMPANY",
    });
    expect(classifyByName(normalizeCompanyName("Müller Immobilien GmbH")).relevance).toBe("likely");
    expect(classifyByName(normalizeCompanyName("Vonovia SE")).relevance).toBe("unknown");
  });
});

describe("misc helpers", () => {
  it("builds stable address keys across street spellings", () => {
    expect(addressKey({ postalCode: "12247", street: "Kaiser-Wilhelm-Str.", houseNumber: "103" })).toBe(
      addressKey({ postalCode: "12247", street: "Kaiser Wilhelm Straße", houseNumber: " 103 " }),
    );
    expect(normalizeStreet("Leonorenstr.")).toBe(normalizeStreet("Leonorenstraße"));
    expect(addressKey({})).toBeNull();
  });

  it("creates readable unique slugs and ordered pairs", () => {
    expect(slugifyCompany("Vonovia SE", "Bochum", "clx123abcdef")).toBe("vonovia-se-bochum-abcdef");
    expect(orderedPair("b", "a")).toEqual(["a", "b"]);
  });

  it("only lets company-like queries trigger an external lookup", () => {
    expect(looksLikeCompanyQuery("Vonovia")).toMatchObject({ ok: true });
    expect(looksLikeCompanyQuery("Kaiser-Wilhelm-Straße 103").ok).toBe(false);
    expect(looksLikeCompanyQuery("12247 Berlin").ok).toBe(false);
    expect(looksLikeCompanyQuery("info@example.org").ok).toBe(false);
    expect(looksLikeCompanyQuery("Hausverwaltung").ok).toBe(false);
  });
});
