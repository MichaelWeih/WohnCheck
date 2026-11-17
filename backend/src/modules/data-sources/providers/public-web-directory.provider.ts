import { Injectable } from "@nestjs/common";
import { ExternalCandidate } from "./osm.provider";

type PublicDirectoryPage = {
  city: string;
  url: string;
  sourceName: string;
  confidenceBase: number;
  knownNames?: string[];
};

const HOUSING_TERMS = [
  "wohnungsunternehmen",
  "wohnungsgesellschaft",
  "wohnungsbaugesellschaft",
  "wohnungsgenossenschaft",
  "wohnungsanbieter",
  "kommunales wohnungsunternehmen",
  "gesellschaft für wohnen",
  "genossenschaft",
  "immobilien",
];

const BLOCKED_TEXT = [
  "kontakt",
  "impressum",
  "datenschutz",
  "karriere",
  "arbeitgeber",
  "ausbildung",
  "download",
  "newsletter",
  "facebook",
  "instagram",
  "linkedin",
  "youtube",
  "mehr erfahren",
  "zurück",
  "über ",
  "eigenheim",
  "geschäftspartner",
  "nachhaltigkeit",
  "presse",
  "referenzen",
  "bereich wohnen",
  "junges wohnen",
  "azubiwohnen",
  "wohnen &",
  "wohnen & pflege",
  "genossenschaftsförderung",
  "immobilienangebote",
  "landeseigene wohnungsunternehmen",
  "zur ",
];

const COMPANY_SUFFIX_REGEX = /\b(ag|eg|gmbh|mbh|kg|kgaa|se|aör|aoer)\b/i;
const KNOWN_BRAND_REGEX = /\b(degewo|howoge|gewobag|gesobau|wbm|berlinovo|dogewo21?|vivawest|saga|münchner wohnen|muenchner wohnen|gag immobilien|swd|gws-wohnen)\b/i;

const PUBLIC_DIRECTORY_PAGES: PublicDirectoryPage[] = [
  {
    city: "Berlin",
    url: "https://www.berlin.de/sen/bauen/neubau/wohnungsbaugesellschaften/",
    sourceName: "Berlin.de: landeseigene Wohnungsunternehmen",
    confidenceBase: 0.88,
    knownNames: ["degewo", "HOWOGE", "Gewobag", "STADT UND LAND", "GESOBAU", "WBM", "berlinovo"],
  },
  {
    city: "Berlin",
    url: "https://www.ombud-lwu.de/infos/landeseigene-wohnungsunternehmen-lwu/",
    sourceName: "Ombudsstelle LWU Berlin",
    confidenceBase: 0.86,
    knownNames: ["degewo AG", "HOWOGE Wohnungsbaugesellschaft mbH", "Gewobag", "STADT UND LAND", "GESOBAU AG", "WBM Wohnungsbaugesellschaft Berlin-Mitte mbH", "berlinovo"],
  },
  {
    city: "Dortmund",
    url: "https://www.dortmund.de/themen/wohnen/dogewo21/",
    sourceName: "Dortmund.de: DOGEWO21",
    confidenceBase: 0.9,
    knownNames: ["DOGEWO21 Dortmunder Gesellschaft für Wohnen mbH"],
  },
  {
    city: "Dortmund",
    url: "https://www.gws-wohnen.de/die-genossenschaft/",
    sourceName: "gws-Wohnen Dortmund-Süd eG",
    confidenceBase: 0.82,
    knownNames: ["gws-Wohnen Dortmund-Süd eG"],
  },
  {
    city: "Dortmund",
    url: "https://www.vivawest.de/",
    sourceName: "VIVAWEST",
    confidenceBase: 0.72,
    knownNames: ["VIVAWEST Wohnen GmbH", "VIVAWEST"],
  },
  {
    city: "Hamburg",
    url: "https://www.saga.hamburg/",
    sourceName: "SAGA Unternehmensgruppe",
    confidenceBase: 0.9,
    knownNames: ["SAGA Unternehmensgruppe", "SAGA Siedlungs-Aktiengesellschaft Hamburg"],
  },
  {
    city: "München",
    url: "https://www.muenchner-wohnen.de/",
    sourceName: "Münchner Wohnen",
    confidenceBase: 0.9,
    knownNames: ["Münchner Wohnen GmbH", "Münchner Wohnen"],
  },
  {
    city: "München",
    url: "https://www.wohnungswirtschaft-muenchen.de/",
    sourceName: "Vereinigung Münchener Wohnungsunternehmen",
    confidenceBase: 0.78,
  },
  {
    city: "Düsseldorf",
    url: "https://www.swd-duesseldorf.de/",
    sourceName: "SWD Düsseldorf",
    confidenceBase: 0.86,
    knownNames: ["SWD Städtische Wohnungsgesellschaft Düsseldorf mbH", "SWD Düsseldorf"],
  },
  {
    city: "Köln",
    url: "https://www.gag-koeln.de/",
    sourceName: "GAG Immobilien Köln",
    confidenceBase: 0.86,
    knownNames: ["GAG Immobilien AG", "GAG Immobilien Köln"],
  },
  {
    city: "Frankfurt am Main",
    url: "https://www.abg.de/",
    sourceName: "ABG Frankfurt Holding",
    confidenceBase: 0.86,
    knownNames: ["ABG FRANKFURT HOLDING", "ABG FRANKFURT HOLDING Wohnungsbau- und Beteiligungsgesellschaft mbH"],
  },
  {
    city: "Stuttgart",
    url: "https://www.swsg.de/",
    sourceName: "SWSG Stuttgart",
    confidenceBase: 0.86,
    knownNames: ["SWSG", "Stuttgarter Wohnungs- und Städtebaugesellschaft mbH"],
  },
  {
    city: "Essen",
    url: "https://www.allbau.de/",
    sourceName: "Allbau Essen",
    confidenceBase: 0.84,
    knownNames: ["Allbau GmbH", "Allbau"],
  },
  {
    city: "Leipzig",
    url: "https://www.lwb.de/",
    sourceName: "LWB Leipzig",
    confidenceBase: 0.86,
    knownNames: ["LWB", "Leipziger Wohnungs- und Baugesellschaft mbH"],
  },
  {
    city: "Nürnberg",
    url: "https://www.wbg.nuernberg.de/",
    sourceName: "wbg Nürnberg",
    confidenceBase: 0.86,
    knownNames: ["wbg Nürnberg", "wbg Nürnberg GmbH Immobilienunternehmen"],
  },
  {
    city: "Bremen",
    url: "https://www.gewoba.de/",
    sourceName: "GEWOBA Bremen",
    confidenceBase: 0.86,
    knownNames: ["GEWOBA", "GEWOBA Aktiengesellschaft Wohnen und Bauen"],
  },
  {
    city: "Hannover",
    url: "https://www.hanova.de/",
    sourceName: "hanova Hannover",
    confidenceBase: 0.84,
    knownNames: ["hanova", "hanova WOHNEN GmbH"],
  },
  {
    city: "Dresden",
    url: "https://www.wid-dresden.de/",
    sourceName: "Wohnen in Dresden",
    confidenceBase: 0.84,
    knownNames: ["Wohnen in Dresden", "WiD Wohnen in Dresden GmbH & Co. KG"],
  },
];

type LinkCandidate = {
  text: string;
  href?: string;
};

@Injectable()
export class PublicWebDirectoryProvider {
  readonly sourceKey = "public-web-directory";

  async fetchHousingCompanyCandidates(city: string): Promise<ExternalCandidate[]> {
    const pages = this.getPagesForCity(city);

    if (pages.length === 0) {
      return [];
    }

    const responses = await Promise.allSettled(
      pages.slice(0, 6).map((page) => this.fetchPageCandidates(page)),
    );

    return responses.flatMap((response) => response.status === "fulfilled" ? response.value : []);
  }

  private getPagesForCity(city: string) {
    const normalizedCity = this.normalize(city);
    return PUBLIC_DIRECTORY_PAGES.filter((page) => this.normalize(page.city) === normalizedCity);
  }

  private async fetchPageCandidates(page: PublicDirectoryPage): Promise<ExternalCandidate[]> {
    const response = await fetch(page.url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "WohnCheck public directory discovery prototype",
      },
      signal: AbortSignal.timeout(7_000),
    });

    if (!response.ok) {
      throw new Error(`${page.sourceName} konnte nicht abgerufen werden (${response.status})`);
    }

    const html = await response.text();
    const links = this.extractLinks(html, page.url);
    const text = this.htmlToText(html);
    const linkCandidates = links.filter((link) =>
      this.looksLikeHousingCompany(link.text, false) && this.shouldUseAnchorCandidate(link, page),
    );
    const knownCandidates = (page.knownNames ?? []).filter((name) =>
      text.toLocaleLowerCase("de-DE").includes(name.toLocaleLowerCase("de-DE")),
    ).map((name) => ({ text: name }));

    return this.dedupe([...knownCandidates, ...linkCandidates])
      .map((candidate) => this.toExternalCandidate(candidate, page, text))
      .filter((candidate) => candidate.confidence >= 0.55);
  }

  private extractLinks(html: string, baseUrl: string): LinkCandidate[] {
    const links: LinkCandidate[] = [];
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = anchorRegex.exec(html))) {
      const attrs = match[1] ?? "";
      const rawText = match[2] ?? "";
      const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
      const text = this.cleanText(rawText);
      const href = hrefMatch?.[1] ? this.resolveUrl(hrefMatch[1], baseUrl) : undefined;

      if (text && !href?.startsWith("mailto:")) {
        links.push({ text, href });
      }
    }

    return links;
  }

  private toExternalCandidate(candidate: LinkCandidate, page: PublicDirectoryPage, pageText: string): ExternalCandidate {
    const name = this.normalizeCompanyName(candidate.text);
    const normalizedText = `${candidate.text} ${pageText.slice(0, 5000)}`.toLocaleLowerCase("de-DE");
    let confidence = page.confidenceBase;

    if (candidate.href) confidence += 0.04;
    if (this.looksLikeHousingCompany(name, true)) confidence += 0.06;
    if (normalizedText.includes(page.city.toLocaleLowerCase("de-DE"))) confidence += 0.03;

    return {
      sourceKey: this.sourceKey,
      externalId: `${this.slugify(page.sourceName)}:${this.slugify(name)}`,
      name,
      city: page.city,
      website: candidate.href,
      externalUrl: candidate.href ?? page.url,
      confidence: Math.min(confidence, 0.96),
      evidence: {
        sourceName: page.sourceName,
        sourceUrl: page.url,
        extractedText: candidate.text,
        extractionMethod: candidate.href ? "anchor" : "known-name-on-page",
      },
    };
  }

  private shouldUseAnchorCandidate(link: LinkCandidate, page: PublicDirectoryPage) {
    if (!page.knownNames?.length) return true;

    const text = link.text.toLocaleLowerCase("de-DE");
    const hasHousingTerm = HOUSING_TERMS.some((term) => text.includes(term));
    return COMPANY_SUFFIX_REGEX.test(link.text) && hasHousingTerm;
  }

  private htmlToText(html: string) {
    return this.cleanText(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    );
  }

  private cleanText(value: string) {
    return value
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&shy;/gi, "")
      .replace(/&uuml;/gi, "ü")
      .replace(/&Uuml;/g, "Ü")
      .replace(/&ouml;/gi, "ö")
      .replace(/&Ouml;/g, "Ö")
      .replace(/&auml;/gi, "ä")
      .replace(/&Auml;/g, "Ä")
      .replace(/&szlig;/gi, "ß")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeCompanyName(value: string) {
    return value
      .replace(/\s+[|–-]\s+.*$/, "")
      .replace(/,\s.*$/, "")
      .replace(/\b(Startseite|Home|Wohnungen|Mieten|Kontakt)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private looksLikeHousingCompany(value: string, allowKnownBrandOnly: boolean) {
    const text = value.toLocaleLowerCase("de-DE");

    if (value.length < 4 || value.length > 90) return false;
    if (BLOCKED_TEXT.some((term) => text === term || text.includes(term))) return false;
    if (/^https?:\/\//i.test(value)) return false;
    if (/^www\./i.test(value)) return false;
    if (value.includes("@")) return false;
    if (/^(zur|zum|zurück zu)\s/i.test(value)) return false;

    const hasHousingTerm = HOUSING_TERMS.some((term) => text.includes(term));
    const hasCompanySuffix = COMPANY_SUFFIX_REGEX.test(value);
    const hasKnownBrand = KNOWN_BRAND_REGEX.test(value);

    if (allowKnownBrandOnly && hasKnownBrand) return true;

    return hasKnownBrand || (hasHousingTerm && hasCompanySuffix);
  }

  private dedupe(candidates: LinkCandidate[]) {
    const byName = new Map<string, LinkCandidate>();

    for (const candidate of candidates) {
      const name = this.normalizeCompanyName(candidate.text);
      const key = this.normalize(name);

      if (!key || byName.has(key)) continue;
      byName.set(key, { ...candidate, text: name });
    }

    return Array.from(byName.values());
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
  }

  private slugify(value: string) {
    return this.normalize(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private resolveUrl(href: string, baseUrl: string) {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  }
}
