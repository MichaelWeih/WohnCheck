import { Landlord, Neighborhood, Property, SearchResult } from "@/data/mock-data";
import {
  ApiLandlord,
  ApiNeighborhood,
  ApiProperty,
  DirectorySearchResponse,
} from "./directory-types";

export function adaptLandlord(apiLandlord: ApiLandlord): Landlord {
  return {
    id: apiLandlord.id,
    name: apiLandlord.name,
    company_type: apiLandlord.companyType,
    city: apiLandlord.city,
    website: apiLandlord.website ?? undefined,
    rating_overall: 0,
    review_count: 0,
    ratings: {},
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
    rating_overall: 0,
    review_count: 0,
    ratings: {},
  };
}

export function adaptNeighborhood(apiNeighborhood: ApiNeighborhood): Neighborhood {
  return {
    id: apiNeighborhood.id,
    district_name: apiNeighborhood.districtName,
    city: apiNeighborhood.city,
    postal_code: apiNeighborhood.postalCode,
    rating_overall: 0,
    review_count: 0,
    ratings: {},
  };
}

export function adaptSearchResults(response: DirectorySearchResponse): SearchResult[] {
  const landlords = response.landlords.map((landlord) => ({
    type: "landlord" as const,
    id: landlord.id,
    title: landlord.name,
    subtitle: landlord.companyType,
    rating: 0,
    reviewCount: 0,
    city: landlord.city,
  }));

  const properties = response.properties.map((property) => ({
    type: "property" as const,
    id: property.id,
    title: `${property.street} ${property.houseNumber}`,
    subtitle: `${property.postalCode} ${property.city}`,
    rating: 0,
    reviewCount: 0,
    city: property.city,
  }));

  const neighborhoods = response.neighborhoods.map((neighborhood) => ({
    type: "neighborhood" as const,
    id: neighborhood.id,
    title: neighborhood.districtName,
    subtitle: neighborhood.city,
    rating: 0,
    reviewCount: 0,
    city: neighborhood.city,
  }));

  return [...landlords, ...properties, ...neighborhoods];
}
