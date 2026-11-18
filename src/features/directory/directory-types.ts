import type { LandlordDetailResponse, PropertyRelationView, SearchPropertyHit } from "@/features/api-types";

/**
 * Frontend-only shapes of directory responses that are not (yet) part of the shared api-types.ts.
 * Landlord cards, search, profiles, buildings and the address lookup use the shared types directly.
 */

/** Present on list and search responses; computed from published WohnCheck reviews only. */
export interface ApiRatingSummary {
  ratingOverall?: number | null;
  reviewCount?: number;
}

/** GET /properties item and search hit. `landlord` is null when no public, verified landlord is known. */
export type ApiProperty = Omit<SearchPropertyHit, "landlordId"> & {
  landlordId: string | null;
  neighborhood?: ApiNeighborhood | null;
};

export interface ApiNeighborhood extends ApiRatingSummary {
  id: string;
  districtName: string;
  city: string;
  postalCode: string;
  slug: string;
  properties?: ApiProperty[];
}

export interface ApiListingCard {
  id: string;
  title: string;
  address: string;
  city: string;
  districtName?: string | null;
  livingAreaSqm?: number | null;
  rooms?: number | null;
  coldRent?: number | null;
  warmRent?: number | null;
  pricePerSqm?: number | null;
  status: string;
}

/** GET /landlords/:id — card + buildings with their (verified or former) role. */
export type ApiLandlordDetail = Omit<LandlordDetailResponse, "properties"> & {
  properties: Array<LandlordDetailResponse["properties"][number] & ApiRatingSummary & { roles: PropertyRelationView[] }>;
  listings: ApiListingCard[];
};

export interface AddressSuggestion {
  id: string;
  label: string;
  shortLabel: string;
  latitude: number;
  longitude: number;
  city?: string;
  district?: string;
  postalCode?: string;
  street?: string;
  houseNumber?: string;
}

export interface AddressSuggestionsResponse {
  query: string;
  suggestions: AddressSuggestion[];
  source?: {
    fromCache: boolean;
    isStale: boolean;
    error?: string;
  };
}

export interface AddressScoreContextResponse {
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  source: {
    fromCache: boolean;
    isStale: boolean;
    error?: string;
  };
  signals: {
    counts: {
      streets: number;
      smallAdministrativeAreas: number;
      transitStops: number;
      schoolsAndCare: number;
      medical: number;
      supermarkets: number;
      leisure: number;
    };
    sample: Array<{
      externalId: string;
      name?: string;
      kind?: string;
      latitude?: number;
      longitude?: number;
    }>;
  } | null;
  scorePreview: {
    total: number;
    confidence: number;
    components: {
      transit: number;
      infrastructure: number;
      leisure: number;
      urbanDensity: number;
    };
    note: string;
  } | null;
}

export interface ExternalListingLink {
  providerKey: string;
  providerName: string;
  status: "api-ready" | "credentials-required" | "permission-required" | "search-link-only";
  isVerified: boolean;
  listingUrl?: string;
  searchUrl: string;
  confidence: "exact" | "address-search" | "provider-search";
  note: string;
  attribution?: string;
}

export interface ExternalListingLinksResponse {
  address: string;
  generatedAt: string;
  links: ExternalListingLink[];
  providerChecks: ExternalListingLink[];
  implementationNotes: string[];
}

export interface MarketPriceMetric {
  value: number | null;
  unit: "EUR_M2";
  label: string;
  sourceKey: string;
  year: number;
  quality: "official" | "official-report" | "derived";
  granularity: "city" | "district" | "postal-code";
}

export interface MarketPriceSource {
  key: string;
  name: string;
  url: string;
  note: string;
}

export interface MarketPricesResponse {
  generatedAt: string;
  city: string;
  district: string | null;
  postalCode: string | null;
  available: boolean;
  rent: MarketPriceMetric | null;
  purchase: MarketPriceMetric | null;
  sources: MarketPriceSource[];
  note: string;
}
