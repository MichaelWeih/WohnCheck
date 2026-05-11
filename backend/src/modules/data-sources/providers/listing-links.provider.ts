import { Injectable } from "@nestjs/common";

type ListingQuery = {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
};

type ListingProviderStatus = "api-ready" | "credentials-required" | "permission-required" | "search-link-only";

export type ListingLink = {
  providerKey: string;
  providerName: string;
  status: ListingProviderStatus;
  isVerified: boolean;
  listingUrl?: string;
  searchUrl: string;
  confidence: "exact" | "address-search" | "provider-search";
  note: string;
  attribution?: string;
};

@Injectable()
export class ListingLinksProvider {
  buildLinks(query: ListingQuery): ListingLink[] {
    const address = this.formatAddress(query);
    const encodedQuery = encodeURIComponent(address);
    const citySlug = this.slugify(query.city);

    return [
      {
        providerKey: "immoscout24",
        providerName: "ImmoScout24",
        status: this.hasImmoScoutCredentials() ? "api-ready" : "credentials-required",
        isVerified: false,
        searchUrl: `https://www.immobilienscout24.de/Suche/de/wohnung-mieten?enteredFrom=one_step_search&q=${encodedQuery}`,
        confidence: "address-search",
        note: this.hasImmoScoutCredentials()
          ? "Offizielle API-Zugangsdaten sind vorhanden; der konkrete Inseratsabgleich muss noch aktiviert werden."
          : "Offizielle API verfügbar, aber OAuth-Zugangsdaten fehlen noch. Ohne bestätigten Treffer wird kein Portal-Link angezeigt.",
        attribution: "Immobilien Scout GmbH",
      },
      {
        providerKey: "immowelt",
        providerName: "Immowelt",
        status: "permission-required",
        isVerified: false,
        searchUrl: `https://www.immowelt.de/suche/wohnungen/mieten?suchbegriff=${encodedQuery}`,
        confidence: "address-search",
        note: "Die Immowelt-API ist nach den Nutzungsbedingungen an Anbieterzugänge und die eigenen Objekte des Anbieters gebunden. Ohne bestätigten Treffer wird kein Portal-Link angezeigt.",
        attribution: "AVIV Germany GmbH",
      },
      {
        providerKey: "kleinanzeigen",
        providerName: "Kleinanzeigen",
        status: "search-link-only",
        isVerified: false,
        searchUrl: `https://www.kleinanzeigen.de/s-wohnung-mieten/${citySlug ? `${citySlug}/` : ""}${encodedQuery}/k0c203`,
        confidence: "provider-search",
        note: "Für unseren Zweck ist keine allgemein nutzbare offizielle Immobilien-Such-API belastbar dokumentiert. Suchlinks werden nicht als Inseratstreffer angezeigt.",
        attribution: "Kleinanzeigen",
      },
      {
        providerKey: "log-immo",
        providerName: "log.immo",
        status: "search-link-only",
        isVerified: false,
        searchUrl: `https://log.immo/api/shib?format=json&marketing_type=RENT&property_type=apartment&city=${encodeURIComponent(query.city ?? "")}&zip=${encodeURIComponent(query.postalCode ?? "")}`,
        confidence: "provider-search",
        note: "Offener OpenImmo-Index mit maschinenlesbaren Feeds. Treffer werden erst nach exaktem Adressabgleich als Link angezeigt.",
        attribution: "log.immo",
      },
    ];
  }

  private hasImmoScoutCredentials() {
    return Boolean(process.env.IMMOSCOUT24_CONSUMER_KEY && process.env.IMMOSCOUT24_CONSUMER_SECRET);
  }

  private formatAddress(query: ListingQuery) {
    return [
      [query.street, query.houseNumber].filter(Boolean).join(" "),
      query.postalCode,
      query.city,
    ].filter(Boolean).join(" ");
  }

  private slugify(value?: string) {
    return (value ?? "")
      .toLocaleLowerCase("de-DE")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
