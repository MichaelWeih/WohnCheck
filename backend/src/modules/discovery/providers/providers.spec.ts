import { mapGleifRecord, splitAddressLine } from "./gleif-landlord.provider";
import { mapWikidataBinding, registerFromOpenCorporates } from "./wikidata-landlord.provider";
import { GoogleMapsProvider, RedditProvider, TrustpilotProvider } from "../../external/platform-providers";

const v = (value: string) => ({ value });
const fetchedAt = new Date("2026-11-18T12:00:00Z");

describe("Wikidata mapping", () => {
  it("maps a housing company with LEI, register number, website and seat", () => {
    const record = mapWikidataBinding(
      {
        item: v("http://www.wikidata.org/entity/Q1202053"),
        labelDe: v("Vonovia"),
        aliases: v("Vonovia SE|Deutsche Annington|Vonovia"),
        websites: v("https://www.vonovia.de"),
        hqCities: v("Bochum"),
        parentIds: v(""),
        strongClasses: v("Q1534992"),
        lei: v("5299005A2ZEP6AP7KM81"),
        openCorporates: v("de/R2201_HRB16879"),
      },
      fetchedAt,
    )!;
    expect(record).toMatchObject({
      sourceKey: "wikidata",
      externalId: "Q1202053",
      name: "Vonovia",
      kind: "HOUSING_COMPANY",
      relevance: "confirmed",
      website: "https://www.vonovia.de",
      headquarters: { city: "Bochum", country: "DE" },
      entityStatus: "active",
    });
    expect(record.aliases).toEqual([{ name: "Vonovia SE" }, { name: "Deutsche Annington" }]);
    expect(record.identifiers).toEqual([
      { scheme: "WIKIDATA", value: "Q1202053" },
      { scheme: "LEI", value: "5299005A2ZEP6AP7KM81" },
      { scheme: "GERMAN_REGISTER", courtCode: "R2201", registerType: "HRB", number: "16879" },
    ]);
  });

  it("does not guess: several websites or seats are left out, weak classes stay 'likely'", () => {
    const record = mapWikidataBinding(
      {
        item: v("http://www.wikidata.org/entity/Q1"),
        labelDe: v("Beispiel Immobilien"),
        websites: v("https://a.example|https://b.example"),
        hqCities: v("Berlin|Hamburg"),
        strongClasses: v(""),
        dissolved: v("2020-01-01T00:00:00Z"),
        parentIds: v("Q1202053"),
      },
      fetchedAt,
    )!;
    expect(record.website).toBeUndefined();
    expect(record.headquarters).toBeUndefined();
    expect(record.kind).toBeUndefined();
    expect(record.relevance).toBe("likely");
    expect(record.entityStatus).toBe("inactive");
    expect(record.relations).toEqual([
      expect.objectContaining({ type: "PARENT_OF", direction: "incoming", other: expect.objectContaining({ identifier: { scheme: "WIKIDATA", value: "Q1202053" } }) }),
    ]);
  });

  it("drops rows without a usable id or name", () => {
    expect(mapWikidataBinding({ item: v("http://www.wikidata.org/entity/Q5") }, fetchedAt)).toBeNull();
    expect(mapWikidataBinding({ labelDe: v("X") }, fetchedAt)).toBeNull();
  });

  it("parses register numbers only with a court code", () => {
    expect(registerFromOpenCorporates("de/K1101R_HRB1")).toBeNull();
    expect(registerFromOpenCorporates("de/F1103_HRA4711")).toEqual({ scheme: "GERMAN_REGISTER", courtCode: "F1103", registerType: "HRA", number: "4711" });
    expect(registerFromOpenCorporates(undefined)).toBeNull();
  });
});

describe("GLEIF mapping", () => {
  const record = (overrides: Record<string, unknown> = {}) => ({
    id: "39120037JXN0FO1OKQ94",
    attributes: {
      lei: "39120037JXN0FO1OKQ94",
      ocid: "de/F1103_HRB12345",
      entity: {
        legalName: { name: "Privata Hausverwaltung GmbH" },
        category: "GENERAL",
        status: "ACTIVE",
        legalAddress: { addressLines: ["Hertzbergstr. 30"], city: "Berlin", postalCode: "12055", region: "DE-BE", country: "DE" },
        ...overrides,
      },
    },
  });

  it("maps the registered name, LEI, register and seat", () => {
    expect(mapGleifRecord(record(), fetchedAt)).toMatchObject({
      sourceKey: "gleif",
      externalId: "39120037JXN0FO1OKQ94",
      name: "Privata Hausverwaltung GmbH",
      nameIsRegistered: true,
      entityNature: "legal_entity",
      relevance: "unknown",
      headquarters: { street: "Hertzbergstr.", houseNumber: "30", postalCode: "12055", city: "Berlin", state: "DE-BE", country: "DE" },
      identifiers: [
        { scheme: "LEI", value: "39120037JXN0FO1OKQ94" },
        { scheme: "GERMAN_REGISTER", courtCode: "F1103", registerType: "HRB", number: "12345" },
      ],
    });
  });

  it("drops sole proprietors and marks inactive entities", () => {
    expect(mapGleifRecord(record({ category: "SOLE_PROPRIETOR" }), fetchedAt)).toBeNull();
    expect(mapGleifRecord(record({ status: "INACTIVE" }), fetchedAt)?.entityStatus).toBe("inactive");
  });

  it("splits address lines conservatively", () => {
    expect(splitAddressLine("Universitätsstraße 133")).toEqual({ street: "Universitätsstraße", houseNumber: "133" });
    expect(splitAddressLine("Am Markt 3a")).toEqual({ street: "Am Markt", houseNumber: "3a" });
    expect(splitAddressLine("Postfach")).toEqual({ street: "Postfach" });
  });
});

describe("external platforms (link only)", () => {
  const company = { landlordId: "l", name: "Vonovia", legalName: null, aliases: [], city: "Bochum", postalCode: null, website: null, websiteDomain: "vonovia.de" };

  it("builds quoted search links and adds the city for short or generic names", () => {
    expect(new TrustpilotProvider().buildSearchLinks(company)[0].url).toBe("https://de.trustpilot.com/search?query=%22Vonovia%22");
    expect(new TrustpilotProvider().buildSearchLinks({ ...company, name: "GWG" })[0].url).toContain("%22GWG%22%20Bochum");
    expect(new GoogleMapsProvider().buildSearchLinks(company)[0].url).toContain("query=Vonovia%20Bochum");
    expect(new RedditProvider().buildSearchLinks(company).map((l) => l.label)).toContain("In r/wohnen suchen");
  });

  it("accepts only canonical profile / discussion URLs of the platform", () => {
    const trustpilot = new TrustpilotProvider();
    expect(trustpilot.parseReferenceUrl("PROFILE", "https://de.trustpilot.com/review/vonovia.de?utm=x")).toEqual({
      type: "PROFILE",
      url: "https://de.trustpilot.com/review/vonovia.de",
      externalId: "vonovia.de",
    });
    expect(trustpilot.parseReferenceUrl("PROFILE", "http://de.trustpilot.com/review/vonovia.de")).toBeNull();
    expect(trustpilot.parseReferenceUrl("PROFILE", "https://evil.example/review/vonovia.de")).toBeNull();
    expect(trustpilot.parseReferenceUrl("PROFILE", "https://de.trustpilot.com/users/123")).toBeNull();
    const reddit = new RedditProvider();
    expect(reddit.parseReferenceUrl("DISCUSSION", "https://www.reddit.com/r/wohnen/comments/abc123/titel_mit_slug/")).toMatchObject({
      url: "https://www.reddit.com/comments/abc123",
      evidence: { subreddit: "wohnen" },
    });
    expect(reddit.describeReference({ evidence: { subreddit: "wohnen" } })).toBe("Diskussion auf Reddit (r/wohnen)");
    expect(reddit.parseReferenceUrl("DISCUSSION", "https://www.reddit.com/user/someone")).toBeNull();
  });
});
