import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ASSOCIATION_SEED_URLS, SOURCE_DEFINITIONS } from "./data-source-registry";
import { OsmProvider } from "./providers/osm.provider";
import { WikidataProvider } from "./providers/wikidata.provider";
import { ListingLinksProvider } from "./providers/listing-links.provider";
import { MarketPricesProvider } from "./providers/market-prices.provider";
import { PublicWebDirectoryProvider } from "./providers/public-web-directory.provider";

type CachedResult<T> = {
  sourceKey: string;
  cacheKey: string;
  fromCache: boolean;
  isStale: boolean;
  fetchedAt: Date;
  expiresAt: Date;
  attribution?: string;
  license: string;
  data: T;
  backgroundRefresh?: boolean;
};

type AreaSignalCounts = {
  streets: number;
  smallAdministrativeAreas: number;
  transitStops: number;
  schoolsAndCare: number;
  medical: number;
  supermarkets: number;
  leisure: number;
};

@Injectable()
export class DataSourcesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly osmProvider: OsmProvider,
    private readonly wikidataProvider: WikidataProvider,
    private readonly listingLinksProvider: ListingLinksProvider,
    private readonly marketPricesProvider: MarketPricesProvider,
    private readonly publicWebDirectoryProvider: PublicWebDirectoryProvider,
  ) {}

  async onModuleInit() {
    await this.ensureSourceCatalog();
  }

  async getSourceCatalog() {
    await this.ensureSourceCatalog();

    return this.prisma.externalSource.findMany({
      orderBy: [{ type: "asc" }, { displayName: "asc" }],
    });
  }

  getRetrievalStrategy() {
    return {
      principle: "WohnCheck speichert eigene Bewertungen dauerhaft und ruft externe Signale live oder mit Ablaufdatum ab.",
      persistentData: [
        "WohnCheck-Nutzerbewertungen",
        "kanonische Zielobjekte wie Vermieter, Gebäude und Gebiete",
        "externe Identifikatoren wie OSM-ID, Wikidata-QID und Google-Place-ID",
        "Quellenbelege, Confidence und letzte erfolgreiche Aktualisierung",
      ],
      liveOrExpiringData: [
        "OSM/Overpass: Straßen, POIs, Gebiete und Infrastruktur mit zeitlich begrenztem Cache",
        "Wikidata: offene Stammdaten mit periodischer Aktualisierung",
        "BKG/Zensus/GovData: amtliche Gebiets- und Wohnungsstruktur mit langem Cache",
        "Google Places: Place-ID dauerhaft, Bewertungen und Places-Inhalte nur live oder gemäß Google-Regeln kurzlebig",
      ],
      sourcePriority: [
        "Eigene WohnCheck-Daten",
        "amtliche Open-Data-Quellen",
        "offene Community-Daten mit Lizenzhinweis",
        "Verbandslisten als Kandidatenquelle",
        "kommerzielle Bewertungsquellen nur mit klaren Nutzungsregeln",
      ],
      associationSeedUrls: ASSOCIATION_SEED_URLS,
      endpoints: {
        sources: "/api/data-sources/sources",
        addressSuggestions: "/api/data-sources/address-suggestions?q=Kastanienallee%2012%20Berlin",
        geocode: "/api/data-sources/geocode?q=Kastanienallee%2012%2C%2010435%20Berlin",
        nearbyPlaces: "/api/data-sources/nearby-places?lat=52.5407&lon=13.4126&radius=1000",
        addressScoreContext: "/api/data-sources/address-score-context?lat=52.5407&lon=13.4126&label=Kastanienallee%2012",
        listingLinks: "/api/data-sources/listing-links?street=Kastanienallee&houseNumber=12&postalCode=10435&city=Berlin",
        marketPrices: "/api/data-sources/market-prices?city=Dortmund&district=H%C3%B6rde&postalCode=44263",
        landlordCandidates: "/api/data-sources/landlord-candidates?city=Berlin",
        publicLandlordDirectory: "/api/data-sources/public-landlord-directory?city=Dortmund",
        areaSignals: "/api/data-sources/area-signals?city=Berlin",
      },
    };
  }

  async getLandlordCandidates(city = "Berlin", refresh = false) {
    await this.ensureSourceCatalog();
    const normalizedCity = this.normalizeCity(city);
    const [osm, wikidata, publicDirectory] = await Promise.allSettled([
      this.withLatencyBudget(
        this.getCached(
          "osm-overpass",
          `osm-overpass:landlord-candidates:${normalizedCity}`,
          refresh,
          () => this.osmProvider.fetchHousingCompanyCandidates(normalizedCity),
        ),
        "osm-overpass",
        300,
      ),
      this.withLatencyBudget(
        this.getCached(
          "wikidata",
          `wikidata:landlord-candidates:${normalizedCity}`,
          refresh,
          () => this.wikidataProvider.fetchHousingCompanyCandidates(normalizedCity),
        ),
        "wikidata",
        1_500,
      ),
      this.withLatencyBudget(
        this.getCached(
          "public-web-directory",
          `public-web-directory:landlord-candidates:${normalizedCity}`,
          refresh,
          () => this.publicWebDirectoryProvider.fetchHousingCompanyCandidates(normalizedCity),
        ),
        "public-web-directory",
        10_000,
      ),
    ]);

    const providerResults = [osm, wikidata, publicDirectory];
    const successful = providerResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const errors = providerResults.flatMap((result) =>
      result.status === "rejected" ? [{ message: result.reason instanceof Error ? result.reason.message : "Quelle konnte nicht abgerufen werden" }] : [],
    );

    return {
      city: normalizedCity,
      generatedAt: new Date().toISOString(),
      results: this.mergeCandidates(successful.flatMap((result) => result.data)),
      sources: successful.map((result) => ({
        sourceKey: result.sourceKey,
        fromCache: result.fromCache,
        isStale: result.isStale,
        backgroundRefresh: result.backgroundRefresh,
        fetchedAt: result.fetchedAt,
        expiresAt: result.expiresAt,
        license: result.license,
        attribution: result.attribution,
      })),
      errors,
      nextStep: "Kandidaten per Website/Register-ID deduplizieren und erst danach als kanonische Vermieter übernehmen.",
    };
  }

  async getPublicLandlordDirectory(city = "Berlin", refresh = false) {
    await this.ensureSourceCatalog();
    const normalizedCity = this.normalizeCity(city);
    const scraped = await this.withLatencyBudget(
      this.getCached(
        "public-web-directory",
        `public-web-directory:landlord-candidates:${normalizedCity}`,
        refresh,
        () => this.publicWebDirectoryProvider.fetchHousingCompanyCandidates(normalizedCity),
      ),
      "public-web-directory",
      6_000,
    );

    return {
      city: normalizedCity,
      generatedAt: new Date().toISOString(),
      results: this.mergeCandidates(scraped.data),
      source: {
        sourceKey: scraped.sourceKey,
        fromCache: scraped.fromCache,
        isStale: scraped.isStale,
        backgroundRefresh: scraped.backgroundRefresh,
        fetchedAt: scraped.fetchedAt,
        expiresAt: scraped.expiresAt,
        license: scraped.license,
        attribution: scraped.attribution,
      },
      guardrails: [
        "Nur öffentlich abrufbare HTML-Seiten aus Stadt-, Verbands- und Unternehmenskontext.",
        "Keine Immobilienportal-Scrapes und keine Bewertungsseiten-Scrapes.",
        "Treffer bleiben Kandidaten und müssen vor Übernahme dedupliziert und plausibilisiert werden.",
      ],
    };
  }

  async getAreaSignals(city = "Berlin", refresh = false) {
    await this.ensureSourceCatalog();
    const normalizedCity = this.normalizeCity(city);
    const osmSignals = await this.withLatencyBudget(
      this.getCached(
        "osm-overpass",
        `osm-overpass:area-signals:${normalizedCity}`,
        refresh,
        () => this.osmProvider.fetchAreaSignals(normalizedCity),
      ),
      "osm-overpass",
    ).catch((error: unknown) => ({
      sourceKey: "osm-overpass",
      cacheKey: `osm-overpass:area-signals:${normalizedCity}`,
      fromCache: false,
      isStale: false,
      fetchedAt: new Date(),
      expiresAt: new Date(),
      attribution: "© OpenStreetMap contributors",
      license: "ODbL",
      data: null,
      error: error instanceof Error ? error.message : "OSM-Gebietsdaten konnten nicht abgerufen werden",
    }));

    return {
      city: normalizedCity,
      generatedAt: new Date().toISOString(),
      osm: {
        fromCache: osmSignals.fromCache,
        isStale: osmSignals.isStale,
        backgroundRefresh: "backgroundRefresh" in osmSignals ? osmSignals.backgroundRefresh : undefined,
        fetchedAt: osmSignals.fetchedAt,
        expiresAt: osmSignals.expiresAt,
        error: "error" in osmSignals ? osmSignals.error : undefined,
        data: osmSignals.data,
      },
      plannedSources: [
        {
          sourceKey: "bkg-vg250",
          purpose: "Amtliche Gemeinde- und Kreisgrenzen für stabile Gebietszuordnung.",
          cacheTtlDays: 180,
        },
        {
          sourceKey: "zensus-2022",
          purpose: "Wohnungsbestand, Leerstand, Baujahr, Wohnflächen und Mieten als Gebietssignale.",
          cacheTtlDays: 180,
        },
      ],
    };
  }

  async getAddressSuggestions(query = "", refresh = false) {
    await this.ensureSourceCatalog();
    const normalizedQuery = this.normalizeAddressQuery(query);

    if (normalizedQuery.length < 3) {
      return {
        query: normalizedQuery,
        generatedAt: new Date().toISOString(),
        suggestions: [],
        sources: [],
      };
    }

    const suggestions = await this.withLatencyBudget(
      this.getCached(
        "osm-overpass",
        `osm-overpass:address-suggestions:${normalizedQuery.toLocaleLowerCase("de-DE")}`,
        refresh,
        () => this.osmProvider.fetchAddressSuggestions(normalizedQuery),
      ),
      "nominatim",
      1_200,
    ).catch((error: unknown) => ({
      sourceKey: "osm-overpass",
      cacheKey: `osm-overpass:address-suggestions:${normalizedQuery.toLocaleLowerCase("de-DE")}`,
      fromCache: false,
      isStale: false,
      fetchedAt: new Date(),
      expiresAt: new Date(),
      attribution: "© OpenStreetMap contributors",
      license: "ODbL",
      data: [],
      error: error instanceof Error ? error.message : "Adressvorschläge konnten nicht abgerufen werden",
    }));

    return {
      query: normalizedQuery,
      generatedAt: new Date().toISOString(),
      suggestions: suggestions.data,
      source: {
        sourceKey: suggestions.sourceKey,
        fromCache: suggestions.fromCache,
        isStale: suggestions.isStale,
        backgroundRefresh: "backgroundRefresh" in suggestions ? suggestions.backgroundRefresh : undefined,
        fetchedAt: suggestions.fetchedAt,
        expiresAt: suggestions.expiresAt,
        license: suggestions.license,
        attribution: suggestions.attribution,
        error: "error" in suggestions ? suggestions.error : undefined,
      },
    };
  }

  async getAddressScoreContext(latitude: number, longitude: number, label = "Adresse", radiusMeters = 1_500, refresh = false) {
    await this.ensureSourceCatalog();
    const safeLatitude = this.clamp(latitude, -90, 90);
    const safeLongitude = this.clamp(longitude, -180, 180);
    const safeRadius = Math.min(Math.max(Math.round(radiusMeters), 500), 5_000);
    const cacheKey = [
      "osm-overpass:address-score-context",
      safeLatitude.toFixed(4),
      safeLongitude.toFixed(4),
      safeRadius,
    ].join(":");
    const context = await this.withLatencyBudget(
      this.getCached(
        "osm-overpass",
        cacheKey,
        refresh,
        () => this.osmProvider.fetchAreaSignalsAround(safeLatitude, safeLongitude, label, safeRadius),
      ),
      "osm-overpass",
      4_000,
    ).catch((error: unknown) => ({
      sourceKey: "osm-overpass",
      cacheKey,
      fromCache: false,
      isStale: false,
      fetchedAt: new Date(),
      expiresAt: new Date(),
      attribution: "© OpenStreetMap contributors",
      license: "ODbL",
      data: null,
      error: error instanceof Error ? error.message : "Score-Kontext konnte nicht abgerufen werden",
    }));

    return {
      label,
      latitude: safeLatitude,
      longitude: safeLongitude,
      radiusMeters: safeRadius,
      generatedAt: new Date().toISOString(),
      source: {
        sourceKey: context.sourceKey,
        fromCache: context.fromCache,
        isStale: context.isStale,
        backgroundRefresh: "backgroundRefresh" in context ? context.backgroundRefresh : undefined,
        fetchedAt: context.fetchedAt,
        expiresAt: context.expiresAt,
        license: context.license,
        attribution: context.attribution,
        error: "error" in context ? context.error : undefined,
      },
      signals: context.data,
      scorePreview: context.data ? this.calculateAddressScorePreview(context.data.counts) : null,
    };
  }

  async getListingLinks(query: {
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
  }) {
    await this.ensureSourceCatalog();
    const normalized = {
      street: this.normalizeAddressQuery(query.street ?? ""),
      houseNumber: this.normalizeAddressQuery(query.houseNumber ?? ""),
      postalCode: this.normalizeAddressQuery(query.postalCode ?? ""),
      city: this.normalizeCity(query.city ?? ""),
    };

    const providerChecks = this.listingLinksProvider.buildLinks(normalized);

    return {
      address: [
        [normalized.street, normalized.houseNumber].filter(Boolean).join(" "),
        normalized.postalCode,
        normalized.city,
      ].filter(Boolean).join(", "),
      generatedAt: new Date().toISOString(),
      links: providerChecks.filter((link) => link.isVerified && link.listingUrl),
      providerChecks,
      implementationNotes: [
        "Portal-Links werden nur angezeigt, wenn ein konkretes Inserat verifiziert wurde.",
        "ImmoScout24: offizieller API-Abgleich ist möglich, sobald OAuth-Zugangsdaten und Freigabe vorliegen.",
        "Immowelt: API laut Nutzungsbedingungen nur für Anbieter mit aktivem Vertrag und eigene Objekte nutzbar.",
        "Kleinanzeigen: keine Suchlinks als vermeintliche Treffer; kein automatisiertes Scraping.",
        "log.immo: offene OpenImmo-Feeds können später für exakte Treffer ergänzt werden.",
      ],
    };
  }

  async getMarketPrices(city = "Berlin", district?: string, postalCode?: string) {
    await this.ensureSourceCatalog();
    return {
      generatedAt: new Date().toISOString(),
      ...this.marketPricesProvider.getPreview(city, district, postalCode),
    };
  }

  private async ensureSourceCatalog() {
    await Promise.all(
      SOURCE_DEFINITIONS.map((source) =>
        this.prisma.externalSource.upsert({
          where: { key: source.key },
          update: {
            displayName: source.displayName,
            type: source.type,
            baseUrl: source.baseUrl,
            termsUrl: source.termsUrl,
            license: source.license,
            attribution: source.attribution,
            refreshIntervalSeconds: source.refreshIntervalSeconds,
            isActive: true,
          },
          create: {
            key: source.key,
            displayName: source.displayName,
            type: source.type,
            baseUrl: source.baseUrl,
            termsUrl: source.termsUrl,
            license: source.license,
            attribution: source.attribution,
            refreshIntervalSeconds: source.refreshIntervalSeconds,
          },
        }),
      ),
    );
  }

  private async getCached<T>(
    sourceKey: string,
    cacheKey: string,
    refresh: boolean,
    fetcher: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    const source = await this.prisma.externalSource.findUniqueOrThrow({
      where: { key: sourceKey },
    });

    if (!refresh) {
      const cached = await this.prisma.sourceCache.findUnique({
        where: { cacheKey },
      });

      if (cached && cached.expiresAt > new Date()) {
        return {
          sourceKey,
          cacheKey,
          fromCache: true,
          isStale: false,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          attribution: cached.attribution ?? undefined,
          license: cached.licenseSnapshot,
          data: cached.payload as T,
        };
      }

      if (cached) {
        void this.refreshCache(sourceKey, cacheKey, source, fetcher);

        return {
          sourceKey,
          cacheKey,
          fromCache: true,
          isStale: true,
          backgroundRefresh: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          attribution: cached.attribution ?? undefined,
          license: cached.licenseSnapshot,
          data: cached.payload as T,
        };
      }
    }

    return this.refreshCache(sourceKey, cacheKey, source, fetcher);
  }

  private async withLatencyBudget<T>(promise: Promise<T>, sourceKey: string, budgetMs = 2_500) {
    promise.catch(() => undefined);

    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`${sourceKey} überschreitet das Latenzbudget von ${budgetMs} ms`)), budgetMs);
      }),
    ]);
  }

  private async refreshCache<T>(
    sourceKey: string,
    cacheKey: string,
    source: {
      attribution: string | null;
      license: string;
      refreshIntervalSeconds: number;
    },
    fetcher: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    const data = await fetcher();
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + source.refreshIntervalSeconds * 1000);

    await this.prisma.sourceCache.upsert({
      where: { cacheKey },
      update: {
        payload: data as Prisma.InputJsonValue,
        attribution: source.attribution,
        licenseSnapshot: source.license,
        fetchedAt,
        expiresAt,
      },
      create: {
        sourceKey,
        cacheKey,
        payload: data as Prisma.InputJsonValue,
        attribution: source.attribution,
        licenseSnapshot: source.license,
        fetchedAt,
        expiresAt,
      },
    });

    return {
      sourceKey,
      cacheKey,
      fromCache: false,
      isStale: false,
      fetchedAt,
      expiresAt,
      attribution: source.attribution ?? undefined,
      license: source.license,
      data,
    };
  }

  private mergeCandidates<T extends { name: string; confidence: number }>(candidates: T[]) {
    const byName = new Map<string, T & { sourceCount: number }>();

    for (const candidate of candidates) {
      const key = candidate.name.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
      const existing = byName.get(key);

      if (!existing || candidate.confidence > existing.confidence) {
        byName.set(key, { ...candidate, sourceCount: (existing?.sourceCount ?? 0) + 1 });
      } else {
        existing.sourceCount += 1;
      }
    }

    return Array.from(byName.values()).sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name, "de"));
  }

  private normalizeCity(city: string) {
    return city.trim() || "Berlin";
  }

  private normalizeAddressQuery(query: string) {
    return query.trim().replace(/\s+/g, " ");
  }

  private clamp(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(Math.max(value, min), max);
  }

  private calculateAddressScorePreview(counts: AreaSignalCounts) {
    const transit = Math.min(100, counts.transitStops * 8);
    const infrastructure = Math.min(100, counts.schoolsAndCare * 5 + counts.medical * 4 + counts.supermarkets * 8);
    const leisure = Math.min(100, counts.leisure * 18);
    const urbanDensity = Math.min(100, counts.streets * 2 + counts.smallAdministrativeAreas * 8);
    const total = Math.round(transit * 0.28 + infrastructure * 0.34 + leisure * 0.18 + urbanDensity * 0.2);

    return {
      total,
      components: {
        transit,
        infrastructure,
        leisure,
        urbanDensity,
      },
      confidence: Math.min(100, 40 + Object.values(counts).reduce((sum, value) => sum + Math.min(value, 10), 0) * 2),
      note: "Vorschau aus Live-Umfelddaten. Nutzerbewertungen und amtliche Wohnungsdaten werden separat ergänzt.",
    };
  }
}
