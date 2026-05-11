import { apiRequest } from "@/lib/api";
import {
  AddressScoreContextResponse,
  AddressSuggestionsResponse,
  ApiLandlord,
  ApiNeighborhood,
  ApiProperty,
  DirectorySearchResponse,
  ExternalListingLinksResponse,
  MarketPricesResponse,
} from "./directory-types";

export function fetchLandlords() {
  return apiRequest<ApiLandlord[]>("/landlords", { method: "GET" });
}

export function fetchLandlord(id: string, city?: string | null) {
  const query = city ? `?city=${encodeURIComponent(city)}` : "";
  return apiRequest<ApiLandlord>(`/landlords/${encodeURIComponent(id)}${query}`, { method: "GET" });
}

export function fetchProperties() {
  return apiRequest<ApiProperty[]>("/properties", { method: "GET" });
}

export function fetchProperty(id: string) {
  return apiRequest<ApiProperty>(`/properties/${id}`, { method: "GET" });
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

export function searchDirectory(query: string) {
  return apiRequest<DirectorySearchResponse>(`/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
  });
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
