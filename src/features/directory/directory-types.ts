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
  listings?: ApiListingCard[];
  profile?: ApiLandlordProfile;
  score?: ApiLandlordScore;
  publicSources?: ApiLandlordPublicSource[];
  externalLinks?: ApiLandlordExternalLink[];
  reviewCount?: number;
  ratingOverall?: number | null;
  ratings?: Record<string, number>;
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
  districtMedianPricePerSqm?: number | null;
  priceDeviationPercent?: number | null;
  status: string;
  dataQualityScore: number;
  sourceProvider?: {
    key: string;
    name: string;
    legalUseStatus: string;
    qualityScore?: number | null;
  } | null;
}

export interface ApiLandlordProfile {
  isExternalCandidate?: boolean;
  knownListingsCount: number;
  activeListingsCount: number;
  averagePricePerSqm?: number | null;
  activeDistricts: string[];
  lastUpdatedAt?: string | Date | null;
  dataQuality?: number | null;
  summary?: string;
}

export interface ApiLandlordScoreFactor {
  key: string;
  label: string;
  value?: number | null;
  weight: number;
  impact: "positive" | "negative" | "neutral";
  explanation: string;
}

export interface ApiLandlordScore {
  totalScore: number;
  confidenceScore: number;
  label: string;
  note: string;
  factors: ApiLandlordScoreFactor[];
}

export interface ApiLandlordPublicSource {
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  observedAt?: string | Date | null;
  confidence?: number | null;
  extractedText?: string;
}

export interface ApiLandlordExternalLink {
  label: string;
  url: string;
  type: "website" | "source" | "listing" | "contact";
}

export interface ApiExternalLandlord {
  id: string;
  name: string;
  companyType: string;
  city: string;
  website?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  confidence?: number;
  reviewCount?: number;
  ratingOverall?: number | null;
  ratings?: Record<string, number>;
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
  reviewCount?: number;
  ratingOverall?: number | null;
  ratings?: Record<string, number>;
  latestScore?: {
    id: string;
    targetType: "PROPERTY";
    targetId: string;
    totalScore: string | number;
    confidenceScore?: string | number | null;
    calculationVersion: string;
    computedAt: string;
  } | null;
}

export interface ApiNeighborhood extends ApiRatingSummary {
  id: string;
  districtName: string;
  city: string;
  postalCode: string;
  slug: string;
  properties?: ApiProperty[];
  reviewCount?: number;
  ratingOverall?: number | null;
  ratings?: Record<string, number>;
}

export interface DirectorySearchResponse {
  landlords: ApiLandlord[];
  properties: ApiProperty[];
  neighborhoods: ApiNeighborhood[];
  externalLandlords?: ApiExternalLandlord[];
}

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
