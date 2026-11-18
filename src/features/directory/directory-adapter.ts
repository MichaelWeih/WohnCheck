import { Neighborhood, Property, SearchResult } from "@/data/mock-data";
import type { LandlordSummary, SearchResponse } from "@/features/api-types";
import { ApiNeighborhood, ApiProperty } from "./directory-types";

export function adaptProperty(apiProperty: ApiProperty): Property {
  return {
    id: apiProperty.id,
    street: apiProperty.street,
    house_number: apiProperty.houseNumber,
    postal_code: apiProperty.postalCode,
    city: apiProperty.city,
    landlord_id: apiProperty.landlordId ?? "",
    landlord_name: apiProperty.landlord?.name ?? "",
    rating_overall: apiProperty.ratingOverall ?? 0,
    review_count: apiProperty.reviewCount ?? 0,
    ratings: {},
  };
}

export function adaptNeighborhood(apiNeighborhood: ApiNeighborhood): Neighborhood {
  return {
    id: apiNeighborhood.id,
    district_name: apiNeighborhood.districtName,
    city: apiNeighborhood.city,
    postal_code: apiNeighborhood.postalCode,
    rating_overall: apiNeighborhood.ratingOverall ?? 0,
    review_count: apiNeighborhood.reviewCount ?? 0,
    ratings: {},
  };
}

/** "Wohnungsgesellschaft · Bochum"; missing values are left out instead of being replaced by placeholders. */
export function landlordSubtitle(landlord: Pick<LandlordSummary, "kind" | "kindLabel" | "city">): string {
  return [landlord.kind === "UNKNOWN" ? "Unternehmen" : landlord.kindLabel, landlord.city].filter(Boolean).join(" · ");
}

export function adaptLandlordCard(landlord: LandlordSummary & { matchedAlias?: string | null }): SearchResult {
  return {
    type: "landlord",
    id: landlord.id,
    title: landlord.name,
    subtitle: [landlordSubtitle(landlord), landlord.matchedAlias ? `auch bekannt als ${landlord.matchedAlias}` : null]
      .filter(Boolean)
      .join(" · "),
    rating: landlord.ratingOverall ?? 0,
    reviewCount: landlord.reviewCount,
    city: landlord.city ?? "",
  };
}

export function adaptSearchResults(response: SearchResponse): SearchResult[] {
  const properties = response.properties.map((property) => ({
    type: "property" as const,
    id: property.id,
    title: `${property.street} ${property.houseNumber}`,
    subtitle: `${property.postalCode} ${property.city}`,
    rating: property.ratingOverall ?? 0,
    reviewCount: property.reviewCount ?? 0,
    city: property.city,
  }));

  const neighborhoods = response.neighborhoods.map((neighborhood) => ({
    type: "neighborhood" as const,
    id: neighborhood.id,
    title: neighborhood.districtName,
    subtitle: neighborhood.city,
    rating: neighborhood.ratingOverall ?? 0,
    reviewCount: neighborhood.reviewCount ?? 0,
    city: neighborhood.city,
  }));

  return [...response.landlords.map(adaptLandlordCard), ...properties, ...neighborhoods];
}
