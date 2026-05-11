import { ExternalSourceType } from "@prisma/client";

export type SourceDefinition = {
  key: string;
  displayName: string;
  type: ExternalSourceType;
  baseUrl?: string;
  termsUrl?: string;
  license: string;
  attribution?: string;
  refreshIntervalSeconds: number;
  cachePolicy: string;
  purpose: string;
};

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    key: "osm-overpass",
    displayName: "OpenStreetMap Overpass",
    type: ExternalSourceType.GEODATA,
    baseUrl: "https://overpass-api.de/api/interpreter",
    termsUrl: "https://www.openstreetmap.org/copyright",
    license: "ODbL",
    attribution: "© OpenStreetMap contributors",
    refreshIntervalSeconds: 60 * 60 * 24 * 14,
    cachePolicy: "Geo- und POI-Daten werden zeitlich begrenzt gecacht und mit OSM-Attribution angezeigt.",
    purpose: "Straßen, Stadtteile, Bezirke, Infrastruktur-POIs und mögliche lokale Wohnungsunternehmen.",
  },
  {
    key: "wikidata",
    displayName: "Wikidata",
    type: ExternalSourceType.COMPANY_DIRECTORY,
    baseUrl: "https://query.wikidata.org/sparql",
    termsUrl: "https://www.wikidata.org/wiki/Wikidata:Licensing",
    license: "CC0",
    attribution: "Wikidata contributors",
    refreshIntervalSeconds: 60 * 60 * 24 * 30,
    cachePolicy: "Offene Stammdaten können länger gecacht werden; Herkunft bleibt als Evidence sichtbar.",
    purpose: "Offene Identifikatoren und Stammdaten für bekannte Wohngesellschaften.",
  },
  {
    key: "bkg-vg250",
    displayName: "BKG Verwaltungsgebiete VG250",
    type: ExternalSourceType.GEODATA,
    baseUrl: "https://gdz.bkg.bund.de",
    termsUrl: "https://www.govdata.de/dl-de/by-2-0",
    license: "dl-de/by-2-0",
    attribution: "GeoBasis-DE / BKG",
    refreshIntervalSeconds: 60 * 60 * 24 * 180,
    cachePolicy: "Amtliche Gebietsdaten werden selten aktualisiert und mit Lizenzhinweis gecacht.",
    purpose: "Amtliche Grenzen für Länder, Kreise und Gemeinden.",
  },
  {
    key: "zensus-2022",
    displayName: "Zensus 2022",
    type: ExternalSourceType.STATISTICS,
    baseUrl: "https://www.zensus2022.de",
    termsUrl: "https://www.zensus2022.de",
    license: "Amtliche Statistik / jeweilige Download-Lizenz prüfen",
    attribution: "Statistische Ämter des Bundes und der Länder",
    refreshIntervalSeconds: 60 * 60 * 24 * 180,
    cachePolicy: "Wohnungsstruktur-Daten werden als periodische Statistik gecacht, nicht als Nutzerbewertung.",
    purpose: "Wohnungsbestand, Leerstand, Baujahr, Wohnfläche, Miete und Eigentumsformen.",
  },
  {
    key: "google-places",
    displayName: "Google Places",
    type: ExternalSourceType.REVIEW_SIGNAL,
    baseUrl: "https://places.googleapis.com/v1",
    termsUrl: "https://developers.google.com/maps/documentation/places/web-service/policies",
    license: "Google Maps Platform Terms",
    attribution: "Google",
    refreshIntervalSeconds: 60 * 60 * 24,
    cachePolicy: "Place-IDs dürfen gespeichert werden; Places-Inhalte und Reviews werden nur gemäß Google-Regeln live oder kurzlebig genutzt.",
    purpose: "Aktuelle externe Bewertungsaggregate und Review-Signale über gespeicherte Place-IDs.",
  },
  {
    key: "housing-associations",
    displayName: "Wohnungswirtschaftliche Verbände",
    type: ExternalSourceType.COMPANY_DIRECTORY,
    license: "Quellenspezifisch prüfen",
    attribution: "GdW-Regionalverbände und BFW-Landesverbände",
    refreshIntervalSeconds: 60 * 60 * 24 * 30,
    cachePolicy: "Verbandslisten werden als Kandidatenquelle gecacht und erst nach Prüfung kanonisiert.",
    purpose: "Kommunale, genossenschaftliche, kirchliche und private Wohnungsunternehmen entdecken.",
  },
  {
    key: "public-web-directory",
    displayName: "Öffentliche Web-Verzeichnisse",
    type: ExternalSourceType.COMPANY_DIRECTORY,
    license: "Quellenspezifisch prüfen",
    attribution: "Kommunale, verbandliche und unternehmenseigene öffentliche Webseiten",
    refreshIntervalSeconds: 60 * 60 * 24 * 14,
    cachePolicy: "Nur öffentlich abrufbare HTML-Seiten werden mit Quellen-URL gecacht; keine Portal- oder Bewertungsseiten-Scrapes.",
    purpose: "Vermieter und Wohngesellschaften über öffentlich einsehbare Stadt-, Verbands- und Unternehmensseiten entdecken.",
  },
  {
    key: "immoscout24",
    displayName: "ImmoScout24",
    type: ExternalSourceType.REGISTRY,
    baseUrl: "https://rest.immobilienscout24.de",
    termsUrl: "https://api.immobilienscout24.de/",
    license: "ImmoScout24 API Terms",
    attribution: "Immobilien Scout GmbH",
    refreshIntervalSeconds: 60 * 60,
    cachePolicy: "Inseratsdaten nur über offizielle API/OAuth oder als direkter Portal-Link; kein Scraping.",
    purpose: "Aktive Inserate einer konkreten Adresse finden und zur Originalanzeige verlinken.",
  },
  {
    key: "immowelt",
    displayName: "Immowelt",
    type: ExternalSourceType.REGISTRY,
    baseUrl: "https://www.immowelt.de",
    termsUrl: "https://www.immowelt.de/meineimmowelt/apinutzungsbedingungen.aspx",
    license: "Immowelt API Terms",
    attribution: "AVIV Germany GmbH",
    refreshIntervalSeconds: 60 * 60,
    cachePolicy: "API nur mit Anbieterzugang und für freigegebene Objekte; sonst nur Portal-Suchlink.",
    purpose: "Optionale Inseratsverknüpfung, wenn ein zulässiger Anbieterzugang vorhanden ist.",
  },
  {
    key: "kleinanzeigen",
    displayName: "Kleinanzeigen",
    type: ExternalSourceType.REGISTRY,
    baseUrl: "https://www.kleinanzeigen.de",
    license: "Portalbedingungen prüfen",
    attribution: "Kleinanzeigen",
    refreshIntervalSeconds: 60 * 60,
    cachePolicy: "Kein Scraping; nur nutzerinitiierte Suchlinks, solange keine passende offizielle API freigegeben ist.",
    purpose: "Adressbezogene Suche nach möglichen Mietinseraten auf dem Portal.",
  },
  {
    key: "log-immo",
    displayName: "log.immo",
    type: ExternalSourceType.REGISTRY,
    baseUrl: "https://log.immo",
    termsUrl: "https://log.immo/",
    license: "OpenImmo-Feed, quellenspezifisch prüfen",
    attribution: "log.immo",
    refreshIntervalSeconds: 60 * 5,
    cachePolicy: "Maschinenlesbare OpenImmo-Feeds kurz cachen und mit Quellenhinweis anzeigen.",
    purpose: "Offene, maschinenlesbare Immobilienfeeds als ergänzende Inseratsquelle.",
  },
];

export const ASSOCIATION_SEED_URLS = [
  "https://bbu.de/mitgliedsunternehmen",
  "https://www.vnw.de/mitgliedsunternehmen",
  "https://www.vdw-sachsen.de/verband/mitglieder/",
  "https://www.vdwbayern.de/",
  "https://vdw-online.de/",
  "https://vdw-rw.de/",
];
