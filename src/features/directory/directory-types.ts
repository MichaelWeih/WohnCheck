export interface ApiLandlord {
  id: string;
  name: string;
  companyType: string;
  city: string;
  website?: string | null;
  slug: string;
  properties?: ApiProperty[];
}

export interface ApiProperty {
  id: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  slug: string;
  landlordId: string;
  neighborhoodId?: string | null;
  landlord?: ApiLandlord;
  neighborhood?: ApiNeighborhood | null;
}

export interface ApiNeighborhood {
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
