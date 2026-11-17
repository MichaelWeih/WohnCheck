import { describe, expect, it } from "vitest";
import { similarLandlords } from "./search-matching";
const landlords = [{ id: "a", name: "Vonovia SE", city: "Bochum", companyType: "Wohnungsgesellschaft", slug: "vonovia" }, { id: "b", name: "Müller Hausverwaltung", city: "Berlin", companyType: "Hausverwaltung", slug: "mueller" }];
describe("search corrections", () => {
  it("offers real directory names for a small typo", () => { expect(similarLandlords("Vonvia", landlords).map(item => item.id)).toEqual(["a"]); });
  it("normalizes umlauts and case", () => { expect(similarLandlords("MULLER", landlords).map(item => item.id)).toEqual(["b"]); });
  it("does not invent unrelated or very short matches", () => { expect(similarLandlords("Unbekannt", landlords)).toEqual([]); expect(similarLandlords("Vo", landlords)).toEqual([]); });
});
