import {
  Place,
  PlaceCategory,
  ResolvedAddress,
} from "../../../common/api/location-types";
export abstract class GeocodingProvider {
  abstract search(
    query: string,
    autocomplete: boolean,
  ): Promise<ResolvedAddress[]>;
}
export abstract class PlacesProvider {
  abstract searchNearby(
    latitude: number,
    longitude: number,
    radius: number,
    category: PlaceCategory,
  ): Promise<{ places: Place[]; truncated: boolean }>;
}
