import { Landlord, Neighborhood, Property, SearchResult } from "@/data/mock-data";
import {
  ApiLandlord,
  ApiNeighborhood,
  ApiProperty,
  DirectorySearchResponse,
} from "./directory-types";

const landlordLogoUrls: Record<string, string> = {
  l1: "/branding/landlords/vonovia.svg",
  l5: "/branding/landlords/dogewo21.svg",
  l7: "/branding/landlords/leg-immobilien.svg",
};

export function adaptLandlord(apiLandlord: ApiLandlord): Landlord {
  return {
    id: apiLandlord.id,
    name: apiLandlord.name,
    company_type: apiLandlord.companyType,
    city: apiLandlord.city,
    website: apiLandlord.website ?? undefined,
    logo_url: landlordLogoUrls[apiLandlord.id],
    rating_overall: apiLandlord.ratingOverall ?? 0,
    review_count: apiLandlord.reviewCount ?? 0,
    ratings: apiLandlord.ratings ?? {},
  };
}

export function adaptProperty(apiProperty: ApiProperty): Property {
  return {
    id: apiProperty.id,
    street: apiProperty.street,
    house_number: apiProperty.houseNumber,
    postal_code: apiProperty.postalCode,
    city: apiProperty.city,
    landlord_id: apiProperty.landlordId,
    landlord_name: apiProperty.landlord?.name ?? "",
    rating_overall: apiProperty.ratingOverall ?? 0,
    review_count: apiProperty.reviewCount ?? 0,
    ratings: apiProperty.ratings ?? {},
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
    ratings: apiNeighborhood.ratings ?? {},
  };
}

export function adaptSearchResults(response: DirectorySearchResponse): SearchResult[] {
  const landlords = response.landlords.map((landlord) => ({
    type: "landlord" as const,
    id: landlord.id,
    title: landlord.name,
    subtitle: landlord.companyType,
    rating: landlord.ratingOverall ?? 0,
    reviewCount: landlord.reviewCount ?? 0,
    city: landlord.city,
  }));

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

  const externalLandlords = (response.externalLandlords ?? []).map((landlord) => ({
    type: "landlord" as const,
    id: landlord.id,
    title: landlord.name,
    subtitle: `${landlord.companyType} · ${landlord.city}`,
    rating: landlord.ratingOverall ?? 0,
    reviewCount: landlord.reviewCount ?? 0,
    city: landlord.city,
    sourceCandidate: true,
    sourceUrl: landlord.sourceUrl ?? undefined,
    websiteUrl: landlord.website ?? undefined,
    sourceLabel: landlord.sourceName ?? "Öffentliche Quelle",
  }));

  return [...landlords, ...externalLandlords, ...properties, ...neighborhoods];
}
