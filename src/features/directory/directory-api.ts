import { apiRequest } from "@/lib/api";
import {
  ApiLandlord,
  ApiNeighborhood,
  ApiProperty,
  DirectorySearchResponse,
} from "./directory-types";

export function fetchLandlords() {
  return apiRequest<ApiLandlord[]>("/landlords", { method: "GET" });
}

export function fetchLandlord(id: string) {
  return apiRequest<ApiLandlord>(`/landlords/${id}`, { method: "GET" });
}

export function fetchProperties() {
  return apiRequest<ApiProperty[]>("/properties", { method: "GET" });
}

export function fetchProperty(id: string) {
  return apiRequest<ApiProperty>(`/properties/${id}`, { method: "GET" });
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
