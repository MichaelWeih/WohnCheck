import { apiRequest } from "@/lib/api";
import type {
  CreateMappingReportRequest,
  CreateMappingReportResponse,
  CreatePropertyReportRequest,
  CreatePropertyReportResponse,
  DiscoveryRequestResponse,
  LandlordExternalResponse,
  LandlordListResponse,
  LandlordProfileResponse,
  LandlordSort,
  PropertyDetailResponse,
  PropertyLookupResponse,
  SearchResponse,
  SuggestResponse,
} from "@/features/api-types";
import {
  AddressScoreContextResponse,
  AddressSuggestionsResponse,
  ApiLandlordDetail,
  ApiNeighborhood,
  ApiProperty,
  ExternalListingLinksResponse,
  MarketPricesResponse,
} from "./directory-types";

export function fetchLandlordList(params: { limit?: number; offset?: number; sort?: LandlordSort } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  if (params.sort) query.set("sort", params.sort);
  return apiRequest<LandlordListResponse>(`/landlords${query.size ? `?${query}` : ""}`, { method: "GET" });
}

export function fetchLandlord(id: string) {
  return apiRequest<ApiLandlordDetail>(`/landlords/${encodeURIComponent(id)}`, { method: "GET" });
}

export function fetchLandlordProfile(id: string) {
  return apiRequest<LandlordProfileResponse>(`/landlords/${encodeURIComponent(id)}/profile`, { method: "GET" });
}

export function fetchLandlordExternal(id: string) {
  return apiRequest<LandlordExternalResponse>(`/landlords/${encodeURIComponent(id)}/external`, { method: "GET" });
}

export function reportLandlord(id: string, body: CreateMappingReportRequest, token?: string | null) {
  return apiRequest<CreateMappingReportResponse>(`/landlords/${encodeURIComponent(id)}/reports`, {
    method: "POST",
    body: JSON.stringify(body),
    token,
  });
}

export function fetchProperties() {
  return apiRequest<ApiProperty[]>("/properties", { method: "GET" });
}

export function fetchProperty(id: string) {
  return apiRequest<PropertyDetailResponse>(`/properties/${encodeURIComponent(id)}`, { method: "GET" });
}

/** Who is responsible for an address? Never guesses; see PropertyLookupResponse. */
export function lookupPropertyByAddress(address: { street: string; houseNumber?: string; postalCode?: string; city?: string }) {
  const query = new URLSearchParams({ street: address.street });
  if (address.houseNumber) query.set("houseNumber", address.houseNumber);
  if (address.postalCode) query.set("postalCode", address.postalCode);
  if (address.city) query.set("city", address.city);
  return apiRequest<PropertyLookupResponse>(`/properties/lookup?${query}`, { method: "GET" });
}

export function reportPropertyLandlord(body: CreatePropertyReportRequest, token: string) {
  return apiRequest<CreatePropertyReportResponse>("/properties/reports", {
    method: "POST",
    body: JSON.stringify(body),
    token,
  });
}

export function fetchListing(id: string) {
  return apiRequest(`/listings/${encodeURIComponent(id)}`, { method: "GET" });
}

export function fetchNeighborhoods() {
  return apiRequest<ApiNeighborhood[]>("/neighborhoods", { method: "GET" });
}

export function fetchNeighborhood(id: string) {
  return apiRequest<ApiNeighborhood>(`/neighborhoods/${id}`, { method: "GET" });
}

/** Server-side search: normalized, fuzzy, ranked; a city word only ranks ("Vonovia Berlin"). */
export function searchDirectory(query: string, signal?: AbortSignal) {
  return apiRequest<SearchResponse>(`/search?q=${encodeURIComponent(query)}`, { method: "GET", signal });
}

export function suggestDirectory(query: string, signal?: AbortSignal) {
  return apiRequest<SuggestResponse>(`/search/suggest?q=${encodeURIComponent(query)}`, { method: "GET", signal });
}

/** Search-on-miss: only ever started by an explicit click. */
export function requestDiscovery(query: string) {
  return apiRequest<DiscoveryRequestResponse>("/discovery/requests", { method: "POST", body: JSON.stringify({ query }) });
}

export function fetchDiscoveryRequest(id: string) {
  return apiRequest<DiscoveryRequestResponse>(`/discovery/requests/${encodeURIComponent(id)}`, { method: "GET" });
}

export function fetchAddressSuggestions(query: string) {
  return apiRequest<AddressSuggestionsResponse>(
    `/data-sources/address-suggestions?q=${encodeURIComponent(query)}`,
    { method: "GET" },
  );
}

export function fetchAddressScoreContext(params: {
  latitude: number;
  longitude: number;
  label: string;
  radius?: number;
}) {
  const searchParams = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    label: params.label,
    radius: String(params.radius ?? 1500),
  });

  return apiRequest<AddressScoreContextResponse>(
    `/data-sources/address-score-context?${searchParams.toString()}`,
    { method: "GET" },
  );
}

export function fetchExternalListingLinks(params: {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}) {
  const searchParams = new URLSearchParams({
    street: params.street,
    houseNumber: params.houseNumber,
    postalCode: params.postalCode,
    city: params.city,
  });

  return apiRequest<ExternalListingLinksResponse>(
    `/data-sources/listing-links?${searchParams.toString()}`,
    { method: "GET" },
  );
}

export function fetchMarketPrices(params: {
  city: string;
  district?: string | null;
  postalCode?: string | null;
}) {
  const searchParams = new URLSearchParams({
    city: params.city,
  });

  if (params.district) {
    searchParams.set("district", params.district);
  }

  if (params.postalCode) {
    searchParams.set("postalCode", params.postalCode);
  }

  return apiRequest<MarketPricesResponse>(
    `/data-sources/market-prices?${searchParams.toString()}`,
    { method: "GET" },
  );
}
