import { Injectable } from "@nestjs/common";

export type RawListingInput = Record<string, unknown>;

@Injectable()
export class ListingNormalizer {
  normalize(input: RawListingInput) {
    const coldRent = this.toNumber(input.coldRent ?? input.kaltmiete);
    const livingAreaSqm = this.toNumber(input.livingAreaSqm ?? input.wohnflaeche ?? input.wohnfläche);

    return {
      title: this.toString(input.title ?? input.titel) ?? "Mietwohnung",
      street: this.toString(input.street ?? input.strasse ?? input.straße),
      houseNumber: this.toString(input.houseNumber ?? input.hausnummer),
      postalCode: this.toString(input.postalCode ?? input.plz),
      city: this.toString(input.city ?? input.stadt) ?? "",
      districtName: this.toString(input.districtName ?? input.stadtteil),
      latitude: this.toNumber(input.latitude ?? input.lat),
      longitude: this.toNumber(input.longitude ?? input.lon ?? input.lng),
      livingAreaSqm,
      rooms: this.toNumber(input.rooms ?? input.zimmer),
      coldRent,
      warmRent: this.toNumber(input.warmRent ?? input.warmmiete),
      pricePerSqm: coldRent && livingAreaSqm ? Number((coldRent / livingAreaSqm).toFixed(2)) : this.toNumber(input.pricePerSqm),
      sourceUrl: this.toString(input.sourceUrl ?? input.url),
      externalId: this.toString(input.externalId ?? input.id),
    };
  }

  private toString(value: unknown) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private toNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
