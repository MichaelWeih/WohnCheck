import { Injectable } from "@nestjs/common";
import { ExternalCandidate } from "./osm.provider";

type WikidataBinding = {
  company?: { value: string };
  companyLabel?: { value: string };
  website?: { value: string };
  locationLabel?: { value: string };
  coordinate?: { value: string };
};

type WikidataResponse = {
  results?: {
    bindings?: WikidataBinding[];
  };
};

type WikidataSearchResult = {
  id: string;
  title?: string;
  label?: string;
  description?: string;
  concepturi?: string;
  url?: string;
};

type WikidataSearchResponse = {
  search?: WikidataSearchResult[];
};

@Injectable()
export class WikidataProvider {
  readonly sourceKey = "wikidata";

  buildHousingCompanyQuery(city: string) {
    const safeCity = city.replace(/["\\]/g, "\\$&");

    return `
      SELECT DISTINCT ?company ?companyLabel ?website ?locationLabel ?coordinate WHERE {
        ?company wdt:P31/wdt:P279* ?type.
        VALUES ?type { wd:Q43229 wd:Q4830453 wd:Q6881511 }
        ?company ?labelPredicate ?labelValue.
        FILTER(CONTAINS(LCASE(STR(?labelValue)), "wohn"))
        OPTIONAL { ?company wdt:P856 ?website. }
        OPTIONAL { ?company wdt:P159 ?headquarters. ?headquarters rdfs:label ?locationLabel FILTER(LANG(?locationLabel) = "de"). }
        OPTIONAL { ?company wdt:P625 ?coordinate. }
        FILTER(
          CONTAINS(LCASE(STR(?locationLabel)), LCASE("${safeCity}")) ||
          CONTAINS(LCASE(STR(?companyLabel)), LCASE("${safeCity}")) ||
          LCASE("${safeCity}") = "deutschland"
        )
        SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
      }
      LIMIT 80
    `;
  }

  async fetchHousingCompanyCandidates(city: string): Promise<ExternalCandidate[]> {
    const searchCandidates = await this.fetchSearchCandidates(city);

    if (searchCandidates.length > 0) {
      return searchCandidates;
    }

    const query = this.buildHousingCompanyQuery(city);
    const url = new URL("https://query.wikidata.org/sparql");
    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      headers: {
        accept: "application/sparql-results+json",
        "user-agent": "WohnCheck data-source prototype",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`Wikidata request failed with ${response.status}`);
    }

    const payload = await response.json() as WikidataResponse;

    return (payload.results?.bindings ?? []).map((binding) => {
      const qid = binding.company?.value.split("/").at(-1) ?? binding.company?.value ?? "";
      const coordinate = this.parseCoordinate(binding.coordinate?.value);

      return {
        sourceKey: this.sourceKey,
        externalId: qid,
        name: binding.companyLabel?.value ?? qid,
        city: binding.locationLabel?.value ?? city,
        website: binding.website?.value,
        latitude: coordinate?.latitude,
        longitude: coordinate?.longitude,
        externalUrl: binding.company?.value,
        confidence: binding.locationLabel?.value?.toLocaleLowerCase("de-DE").includes(city.toLocaleLowerCase("de-DE")) ? 0.78 : 0.62,
        evidence: {
          wikidataUrl: binding.company?.value,
          location: binding.locationLabel?.value,
          coordinate: binding.coordinate?.value,
        },
      };
    });
  }

  private async fetchSearchCandidates(city: string): Promise<ExternalCandidate[]> {
    const terms = this.buildSearchTerms(city);
    const responses = await Promise.allSettled(
      terms.map(async (term) => {
        const url = new URL("https://www.wikidata.org/w/api.php");
        url.searchParams.set("action", "wbsearchentities");
        url.searchParams.set("search", term);
        url.searchParams.set("language", "de");
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "15");

        const response = await fetch(url, {
          headers: {
            accept: "application/json",
            "user-agent": "WohnCheck data-source prototype",
          },
          signal: AbortSignal.timeout(5_000),
        });

        if (!response.ok) {
          throw new Error(`Wikidata search failed with ${response.status}`);
        }

        return response.json() as Promise<WikidataSearchResponse>;
      }),
    );
    const successfulResponses = responses.flatMap((response) =>
      response.status === "fulfilled" ? [response.value] : [],
    );

    const seen = new Set<string>();

    return successfulResponses.flatMap((payload) =>
      (payload.search ?? []).flatMap((entry) => {
        if (this.isNonCompanyResult(entry)) {
          return [];
        }

        if (seen.has(entry.id)) {
          return [];
        }

        seen.add(entry.id);

        return [{
          sourceKey: this.sourceKey,
          externalId: entry.id,
          name: entry.label ?? entry.title ?? entry.id,
          city,
          externalUrl: entry.concepturi ?? entry.url,
          confidence: this.scoreSearchResult(entry, city),
          evidence: {
            description: entry.description,
            wikidataUrl: entry.concepturi ?? entry.url,
          },
        }];
      }),
    ).filter((candidate) => candidate.confidence >= 0.45);
  }

  private buildSearchTerms(city: string) {
    const lowerCity = city.toLocaleLowerCase("de-DE");
    const citySeeds: Record<string, string[]> = {
      berlin: ["Gewobag", "HOWOGE", "degewo", "GESOBAU", "STADT UND LAND Berlin", "Deutsche Wohnen"],
      dortmund: ["DOGEWO21", "Vivawest", "LEG Immobilien"],
      düsseldorf: ["LEG Immobilien", "SWD Düsseldorf", "Vivawest"],
      duesseldorf: ["LEG Immobilien", "SWD Düsseldorf", "Vivawest"],
      hamburg: ["SAGA Hamburg", "Bauverein der Elbgemeinden", "Hamburger Wohnen"],
      münchen: ["GEWOFAG", "GWG München", "Münchner Wohnen"],
      muenchen: ["GEWOFAG", "GWG München", "Münchner Wohnen"],
      köln: ["GAG Immobilien Köln", "LEG Immobilien", "Wohnungsgenossenschaft Köln"],
      koeln: ["GAG Immobilien Köln", "LEG Immobilien", "Wohnungsgenossenschaft Köln"],
    };

    return [
      ...(citySeeds[lowerCity] ?? []),
      `Wohnungsunternehmen ${city}`,
      `Wohnungsgesellschaft ${city}`,
      `Wohnungsgenossenschaft ${city}`,
    ];
  }

  private scoreSearchResult(entry: WikidataSearchResult, city: string) {
    const haystack = `${entry.label ?? ""} ${entry.description ?? ""}`.toLocaleLowerCase("de-DE");
    let score = 0.46;

    if (haystack.includes("wohnungsunternehmen")) score += 0.24;
    if (haystack.includes("wohnungsgesellschaft")) score += 0.2;
    if (haystack.includes("wohnungsgenossenschaft")) score += 0.2;
    if (haystack.includes("housing company")) score += 0.24;
    if (haystack.includes("housing association")) score += 0.22;
    if (haystack.includes("real estate company")) score += 0.18;
    if (haystack.includes(city.toLocaleLowerCase("de-DE"))) score += 0.12;

    return Math.min(score, 0.92);
  }

  private isNonCompanyResult(entry: WikidataSearchResult) {
    const haystack = `${entry.label ?? ""} ${entry.description ?? ""}`.toLocaleLowerCase("de-DE");

    return [
      "project",
      "architectural structure",
      "building",
      "street",
      "bridge",
      "referendum",
      "movement",
      "football stadium",
      "siedlung",
    ].some((blockedTerm) => haystack.includes(blockedTerm));
  }

  private parseCoordinate(value?: string) {
    const match = value?.match(/Point\\(([-0-9.]+) ([-0-9.]+)\\)/);

    if (!match) {
      return undefined;
    }

    return {
      longitude: Number(match[1]),
      latitude: Number(match[2]),
    };
  }
}
