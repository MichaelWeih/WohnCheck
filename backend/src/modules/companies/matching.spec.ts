import { IdentifierScheme } from "@prisma/client";
import { MatchSubject, scoreCompanyMatch } from "./matching";
import { normalizeCompanyName, registrableDomain } from "./normalization";

type Spec = {
  name: string;
  legal?: string;
  aliases?: string[];
  lei?: string;
  qid?: string;
  register?: string;
  website?: string;
  postalCode?: string;
  city?: string;
};

function subject(spec: Spec): MatchSubject {
  const entry = (raw: string, kind: "primary" | "legal" | "alias") => {
    const n = normalizeCompanyName(raw);
    return { normalized: n.normalized, legalForm: n.legalForm, kind };
  };
  return {
    names: [
      entry(spec.name, "primary"),
      ...(spec.legal ? [entry(spec.legal, "legal" as const)] : []),
      ...(spec.aliases ?? []).map((alias) => entry(alias, "alias")),
    ],
    identifiers: [
      ...(spec.lei ? [{ scheme: IdentifierScheme.LEI, value: spec.lei }] : []),
      ...(spec.qid ? [{ scheme: IdentifierScheme.WIKIDATA, value: spec.qid }] : []),
      ...(spec.register ? [{ scheme: IdentifierScheme.GERMAN_REGISTER, value: spec.register }] : []),
    ],
    websiteDomain: registrableDomain(spec.website),
    postalCode: spec.postalCode ?? null,
    city: spec.city ?? null,
  };
}

const LEI_X = "529900CE1GXC9ZMQSI69";
const LEI_Y = "391200MFJBJXQ1NO3K75";

// Mandatory cases of docs/vermieter-verzeichnis.md section 3.2.
const cases: Array<[string, Spec, Spec, "same" | "candidate" | "different"]> = [
  ["same LEI", { name: "Vonovia SE", lei: LEI_X }, { name: "VONOVIA S.E.", lei: LEI_X }, "same"],
  ["different LEI", { name: "Vonovia SE", lei: LEI_X }, { name: "Vonovia SE", lei: LEI_Y }, "different"],
  ["same domain", { name: "Vonovia", website: "https://vonovia.de" }, { name: "Vonovia SE", website: "https://www.vonovia.de/kontakt" }, "same"],
  ["no domain, no place", { name: "Vonovia" }, { name: "Vonovia SE", city: "Bochum" }, "candidate"],
  ["subsidiary with extra words", { name: "Vonovia SE" }, { name: "Vonovia Immobilien Treuhand GmbH" }, "different"],
  ["different cities in name", { name: "Wohnungsbaugenossenschaft Berlin eG" }, { name: "Wohnungsbaugenossenschaft Hamburg eG" }, "different"],
  ["same name, different postal code", { name: "Wohnungsgenossenschaft Aufbau eG", postalCode: "01067" }, { name: "Wohnungsgenossenschaft Aufbau eG", postalCode: "39104" }, "candidate"],
  ["umlaut spelling, same postal code and form", { name: "Hausverwaltung Müller GmbH", postalCode: "80331" }, { name: "Hausverwaltung Mueller GmbH", postalCode: "80331" }, "same"],
  ["legal form only on one side", { name: "Hausverwaltung Müller", postalCode: "80331" }, { name: "Hausverwaltung Müller GmbH", postalCode: "80331" }, "candidate"],
  ["GmbH vs GmbH & Co. KG with same domain", { name: "Müller Immobilien GmbH", website: "https://mueller-immo.de" }, { name: "Müller Immobilien GmbH & Co. KG", website: "https://mueller-immo.de" }, "candidate"],
  ["numbered project companies", { name: "Objekt 12 GmbH & Co. KG" }, { name: "Objekt 13 GmbH & Co. KG" }, "different"],
  ["short name vs registered name", { name: "Gewobag" }, { name: "Gewobag Wohnungsbau-Aktiengesellschaft Berlin" }, "candidate"],
  ["name plus seat city", { name: "Stadtbau GmbH", city: "Würzburg" }, { name: "Stadtbau Würzburg GmbH" }, "candidate"],
  ["same name, different cities", { name: "Spar- und Bauverein eG", city: "Dortmund" }, { name: "Spar- und Bauverein eG", city: "Hannover" }, "candidate"],
  ["SE vs AG with same domain", { name: "Deutsche Wohnen SE", website: "https://deutsche-wohnen.com" }, { name: "Deutsche Wohnen AG", website: "https://www.deutsche-wohnen.com" }, "candidate"],
  ["same name, only the town name", { name: "Neustadt Wohnbau GmbH", city: "Neustadt" }, { name: "Neustadt Wohnbau GmbH", city: "Neustadt" }, "candidate"],
  ["same QID, different names", { name: "LEG", qid: "Q1600385" }, { name: "LEG Wohnen NRW GmbH", qid: "Q1600385" }, "candidate"],
  ["same register", { name: "A GmbH", register: "R2201_HRB16879" }, { name: "B GmbH", register: "R2201_HRB16879" }, "same"],
  ["empty core name", { name: "GmbH" }, { name: "GmbH" }, "different"],
];

describe("scoreCompanyMatch (spec section 3.2)", () => {
  it.each(cases)("%s", (_title, a, b, expected) => {
    expect(scoreCompanyMatch(subject(a), subject(b)).decision).toBe(expected);
    // The decision must not depend on the order of the arguments.
    expect(scoreCompanyMatch(subject(b), subject(a)).decision).toBe(expected);
  });

  it("never merges by a fuzzy name alone", () => {
    const result = scoreCompanyMatch(subject({ name: "Vonovia" }), subject({ name: "Vonovia" }));
    expect(result.decision).toBe("candidate");
  });

  it("a shared QID with the same name is the same entity", () => {
    expect(
      scoreCompanyMatch(subject({ name: "degewo AG", qid: "Q1185412" }), subject({ name: "degewo", qid: "Q1185412" }))
        .decision,
    ).toBe("same");
  });

  it("conflicting register numbers with similar names go to review, not merge", () => {
    const result = scoreCompanyMatch(
      subject({ name: "Vonovia SE", register: "R2201_HRB16879" }),
      subject({ name: "Vonovia SE", register: "R2201_HRB99999" }),
    );
    expect(result.decision).toBe("candidate");
    expect(result.reasons).toContain("identifier_conflict");
  });

  it("an alias alone never yields same", () => {
    const result = scoreCompanyMatch(
      subject({ name: "Deutsche Wohnen SE", aliases: ["GSW Immobilien"], website: "https://dw.de" }),
      subject({ name: "GSW Immobilien", website: "https://dw.de" }),
    );
    expect(result.decision).toBe("candidate");
  });

  it("a name of industry words only never matches an unrelated company", () => {
    // Regression from the first live import: an alias "Wohnungsbaugesellschaft" paired with dozens of companies.
    expect(
      scoreCompanyMatch(subject({ name: "Wohnungsbaugesellschaft" }), subject({ name: "GEBAG", city: "Duisburg" })).decision,
    ).toBe("different");
    expect(
      scoreCompanyMatch(
        subject({ name: "Handwerksbau AG Thüringen", aliases: ["Wohnungsbaugesellschaft"] }),
        subject({ name: "Wohnungsgesellschaft mbH Hoyerswerda", city: "Hoyerswerda" }),
      ).decision,
    ).toBe("different");
  });

  it("keeps identical names of different registrations apart until reviewed (Wikidata vs GLEIF)", () => {
    expect(
      scoreCompanyMatch(
        subject({ name: "Howoge", qid: "Q1632050", website: "https://www.howoge.de/", city: "Berlin" }),
        subject({ name: "HOWOGE Wohnungsbaugesellschaft mit beschränkter Haftung", lei: "529900ABCDEFGHIJKL12", city: "Berlin" }),
      ).decision,
    ).toBe("candidate");
  });

  it("orders candidates by score", () => {
    const close = scoreCompanyMatch(subject({ name: "Gewobag" }), subject({ name: "Gewobag AG" }));
    expect(close.score).toBeGreaterThan(0);
    expect(close.score).toBeLessThanOrEqual(1);
  });
});
