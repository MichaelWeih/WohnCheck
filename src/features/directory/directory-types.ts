import type { PropertyPartyView } from "@/features/api-types";

/** Present on list and search responses; computed from published reviews. */
export interface ApiRatingSummary {
  ratingOverall?: number | null;
  reviewCount?: number;
}

export interface ApiLandlord extends ApiRatingSummary {
  id: string;
  name: string;
  companyType: string;
  city: string;
  website?: string | null;
  slug: string;
  properties?: ApiProperty[];
}

export interface ApiProperty extends ApiRatingSummary {
  id: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  slug: string;
  landlordId: string;
  neighborhoodId?: string | null;
  /** null when the property's landlord is not public. */
  landlord?: Pick<ApiLandlord, "id" | "name" | "slug"> | null;
  neighborhood?: ApiNeighborhood | null;
  /** Owner / landlord / manager of the property (GET /properties/:id); only public companies. */
  parties?: PropertyPartyView[];
}

export interface ApiNeighborhood extends ApiRatingSummary {
  id: string;
  districtName: string;
  city: string;
  postalCode: string;
  slug: string;
  properties?: ApiProperty[];
}

export interface DirectorySearchResponse {
  landlords: ApiLandlord[];
  properties: ApiProperty[];
  neighborhoods: ApiNeighborhood[];
}
