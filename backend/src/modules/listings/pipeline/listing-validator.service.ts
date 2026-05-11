import { Injectable } from "@nestjs/common";

type NormalizedListing = {
  city: string;
  coldRent: number | null;
  livingAreaSqm: number | null;
  rooms: number | null;
  sourceUrl: string | null;
};

@Injectable()
export class ListingValidator {
  validate(input: NormalizedListing) {
    const errors: string[] = [];

    if (!input.city) errors.push("Stadt fehlt");
    if (!input.coldRent) errors.push("Kaltmiete fehlt");
    if (!input.livingAreaSqm) errors.push("Wohnfläche fehlt");
    if (!input.rooms) errors.push("Zimmeranzahl fehlt");

    return {
      isValid: errors.length === 0,
      errors,
      dataQualityScore: this.calculateDataQuality(input, errors),
    };
  }

  private calculateDataQuality(input: NormalizedListing, errors: string[]) {
    let score = 35;
    if (input.city) score += 10;
    if (input.coldRent && input.livingAreaSqm) score += 20;
    if (input.rooms) score += 10;
    if (input.sourceUrl) score += 10;
    score -= errors.length * 8;
    return Math.max(0, Math.min(100, score));
  }
}
