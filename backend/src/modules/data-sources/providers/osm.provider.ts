import { Injectable } from "@nestjs/common";

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type NominatimPlace = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: Record<string, string>;
};

export type ExternalCandidate = {
  sourceKey: string;
  externalId: string;
  name: string;
  city?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  externalUrl?: string;
  confidence: number;
  evidence: Record<string, unknown>;
};

export type AddressSuggestion = {
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
  osmType?: string;
  osmId?: number;
  importance?: number;
};

@Injectable()
export class OsmProvider {
  readonly sourceKey = "osm-overpass";
  private readonly geocodeCache = new Map<string, { latitude: number; longitude: number }>();

  buildHousingCompanyQuery(city: string) {
    const escapedCity = city.replace(/["\\]/g, "\\$&");

    return `
      [out:json][timeout:12];
      area["name"="${escapedCity}"]["boundary"="administrative"]["admin_level"~"^(4|6|8)$"]->.searchArea;
      (
        nwr["office"="property_management"]["name"](area.searchArea);
        nwr["name"~"(Wohnungsbau|Wohnungsgenossenschaft|Wohnungsgesellschaft)", i](area.searchArea);
      );
      out center tags qt 30;
    `;
  }

  buildHousingCompanyAroundQuery(latitude: number, longitude: number) {
    return `
      [out:json][timeout:12];
      (
        nwr(around:15000,${latitude},${longitude})["office"="property_management"]["name"];
        nwr(around:15000,${latitude},${longitude})["name"~"(Wohnungsbau|Wohnungsgenossenschaft|Wohnungsgesellschaft|Wohnen)", i];
      );
      out center tags qt 40;
    `;
  }

  buildAreaSignalsQuery(latitude: number, longitude: number) {
    return this.buildAreaSignalsAroundQuery(latitude, longitude, 5_000);
  }

  buildAreaSignalsAroundQuery(latitude: number, longitude: number, radiusMeters: number) {
    const radius = Math.min(Math.max(Math.round(radiusMeters), 500), 8_000);

    return `
      [out:json][timeout:12];
      (
        nwr(around:${radius},${latitude},${longitude})["public_transport"~"^(platform|stop_position|station)$"];
        nwr(around:${radius},${latitude},${longitude})["highway"="bus_stop"];
        nwr(around:${radius},${latitude},${longitude})["railway"~"^(station|halt|tram_stop|subway_entrance)$"];
        nwr(around:${radius},${latitude},${longitude})["amenity"~"^(school|kindergarten|doctors|hospital)$"];
        nwr(around:${radius},${latitude},${longitude})["shop"="supermarket"];
        nwr(around:${radius},${latitude},${longitude})["leisure"~"^(park|sports_centre)$"];
      );
      out center tags qt 120;
    `;
  }

  async fetchHousingCompanyCandidates(city: string): Promise<ExternalCandidate[]> {
    const center = await this.geocodeCity(city);
    const payload = await this.queryOverpass(this.buildHousingCompanyAroundQuery(center.latitude, center.longitude));

    return this.toCandidates(payload, city);
  }

  async fetchAreaSignals(city: string) {
    const center = await this.geocodeCity(city);
    return this.fetchAreaSignalsAround(center.latitude, center.longitude, city, 5_000);
  }

  async fetchAreaSignalsAround(latitude: number, longitude: number, label: string, radiusMeters: number) {
    const payload = await this.queryOverpass(this.buildAreaSignalsAroundQuery(latitude, longitude, radiusMeters));
    const elements = payload.elements ?? [];

    return {
      label,
      latitude,
      longitude,
      radiusMeters,
      sourceKey: this.sourceKey,
      counts: {
        streets: elements.filter((element) => element.type === "way" && element.tags?.highway).length,
        smallAdministrativeAreas: elements.filter((element) => element.type === "relation" && element.tags?.boundary).length,
        transitStops: elements.filter((element) =>
          Boolean(element.tags?.public_transport || element.tags?.highway === "bus_stop" || element.tags?.railway),
        ).length,
        schoolsAndCare: elements.filter((element) => ["school", "kindergarten"].includes(element.tags?.amenity ?? "")).length,
        medical: elements.filter((element) => ["doctors", "hospital"].includes(element.tags?.amenity ?? "")).length,
        supermarkets: elements.filter((element) => element.tags?.shop === "supermarket").length,
        leisure: elements.filter((element) => element.tags?.leisure).length,
      },
      sample: elements.slice(0, 25).map((element) => ({
        externalId: `${element.type}/${element.id}`,
        name: element.tags?.name,
        kind: element.tags?.amenity ?? element.tags?.shop ?? element.tags?.leisure ?? element.tags?.highway ?? element.tags?.boundary,
        latitude: element.lat ?? element.center?.lat,
        longitude: element.lon ?? element.center?.lon,
      })),
    };
  }

  async fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "de");
    url.searchParams.set("limit", "6");

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "WohnCheck address autocomplete prototype",
      },
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      throw new Error(`Nominatim address search failed with ${response.status}`);
    }

    const places = await response.json() as NominatimPlace[];

    return places
      .map((place) => this.toAddressSuggestion(place))
      .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion));
  }

  private async geocodeCity(city: string) {
    const cacheKey = city.toLocaleLowerCase("de-DE").trim();
    const cached = this.geocodeCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${city}, Deutschland`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "WohnCheck data-source prototype",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`Nominatim request failed with ${response.status}`);
    }

    const places = await response.json() as NominatimPlace[];
    const place = places[0];

    if (!place) {
      throw new Error(`Keine OSM-Koordinate für ${city} gefunden`);
    }

    const center = {
      latitude: Number(place.lat),
      longitude: Number(place.lon),
    };

    this.geocodeCache.set(cacheKey, center);
    return center;
  }

  private toAddressSuggestion(place: NominatimPlace): AddressSuggestion | undefined {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !place.display_name) {
      return undefined;
    }

    const address = place.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? address.municipality;
    const district = address.suburb ?? address.city_district ?? address.borough ?? address.quarter;
    const street = address.road ?? address.pedestrian ?? address.footway;
    const houseNumber = address.house_number;
    const postalCode = address.postcode;
    const shortParts = [
      street && houseNumber ? `${street} ${houseNumber}` : street,
      postalCode,
      city,
    ].filter(Boolean);

    return {
      id: `${place.osm_type ?? "place"}:${place.osm_id ?? place.place_id ?? place.display_name}`,
      label: place.display_name,
      shortLabel: shortParts.length > 0 ? shortParts.join(", ") : place.display_name,
      latitude,
      longitude,
      city,
      district,
      postalCode,
      street,
      houseNumber,
      osmType: place.osm_type,
      osmId: place.osm_id,
      importance: place.importance,
    };
  }

  private async queryOverpass(query: string): Promise<OverpassResponse> {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "WohnCheck data-source prototype",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`Overpass request failed with ${response.status}`);
    }

    return response.json() as Promise<OverpassResponse>;
  }

  private toCandidates(payload: OverpassResponse, city: string): ExternalCandidate[] {
    const seen = new Set<string>();

    return (payload.elements ?? []).flatMap((element) => {
      const name = element.tags?.name ?? element.tags?.operator;

      if (!name) {
        return [];
      }

      const normalizedName = name.trim();
      const dedupeKey = normalizedName.toLocaleLowerCase("de-DE");

      if (seen.has(dedupeKey)) {
        return [];
      }

      seen.add(dedupeKey);

      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;

      return [{
        sourceKey: this.sourceKey,
        externalId: `${element.type}/${element.id}`,
        name: normalizedName,
        city,
        website: element.tags?.website ?? element.tags?.contactWebsite,
        latitude,
        longitude,
        externalUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        confidence: this.scoreCandidate(element.tags ?? {}),
        evidence: {
          osmType: element.type,
          osmId: element.id,
          tags: element.tags ?? {},
        },
      }];
    });
  }

  private scoreCandidate(tags: Record<string, string>) {
    if (tags.office === "property_management") return 0.82;
    if (tags.name?.match(/wohnungs(genossenschaft|gesellschaft|bau)|wohnen/i)) return 0.76;
    if (tags.operator?.match(/wohnungs(genossenschaft|gesellschaft|bau)|wohnen/i)) return 0.72;
    if (tags.office === "estate_agent") return 0.48;
    return 0.4;
  }
}
