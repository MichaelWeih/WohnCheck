import type { Neighborhood, Property } from "@/data/mock-data";
import { adaptNeighborhood, adaptProperty } from "@/features/directory/directory-adapter";
import type { ApiNeighborhood, ApiProperty } from "@/features/directory/directory-types";

export type MappedProperty = Property & {
  latitude: number;
  longitude: number;
  publicSignals?: PublicSignal[];
};

export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type PublicSignalKey = "transit" | "safety" | "infrastructure" | "internet" | "leisure";

export type PublicSignal = {
  key: PublicSignalKey;
  label: string;
  score: number;
  detail: string;
};

export type LegalImage = {
  url: string;
  alt: string;
  sourceName: string;
  sourceUrl: string;
  license: "own" | "public-domain" | "cc-by" | "cc-by-sa" | "gfdl" | "licensed";
  attribution: string;
};

export type PlaceMedia = {
  image?: LegalImage;
  websiteUrl?: string;
};

export type InfrastructureAmenityKind = "shop" | "kita" | "school" | "doctor" | "work";

export type InfrastructureAmenity = MapPoint & {
  id: string;
  name: string;
  kind: InfrastructureAmenityKind;
  targetIds: string[];
  media?: PlaceMedia;
};

export type TransitStationKind = "ubahn" | "sbahn" | "tram" | "bus" | "rail";

export type TransitStation = MapPoint & {
  id: string;
  name: string;
  kind: TransitStationKind;
  lines: string[];
  targetIds: string[];
  media?: PlaceMedia;
};

export type InternetConnectionType = "dsl" | "cable" | "fiber" | "mobile";

export type InternetAvailability = {
  id: string;
  targetId: string;
  provider: string;
  type: InternetConnectionType;
  downloadMbit: number;
  uploadMbit: number;
  status: "available" | "planned" | "limited";
  note: string;
};

export type LeisurePlaceKind = "park" | "culture" | "sport" | "food" | "nightlife";

export type LeisurePlace = MapPoint & {
  id: string;
  name: string;
  kind: LeisurePlaceKind;
  targetIds: string[];
  media?: PlaceMedia;
};

export type SafetyObservation = MapPoint & {
  id: string;
  title: string;
  category: "theft" | "nightlife" | "traffic" | "low";
  riskLevel: "low" | "medium" | "elevated";
  casesPer1000: number;
  trend: "falling" | "stable" | "rising";
  targetIds: string[];
  media?: PlaceMedia;
};

export type MappedNeighborhood = Neighborhood & {
  center: MapPoint;
  polygon: MapPoint[];
  publicSignals?: PublicSignal[];
};

const propertyCoordinates: Record<string, { latitude: number; longitude: number }> = {
  p1: { latitude: 52.5407, longitude: 13.4126 },
  p2: { latitude: 48.1598, longitude: 11.5867 },
  p3: { latitude: 53.5618, longitude: 9.9627 },
  p4: { latitude: 52.5155, longitude: 13.4478 },
};

const commonsImages = {
  kollwitzplatz: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Berlin%20Kollwitzplatz.jpg",
    alt: "Kollwitzplatz in Berlin",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Berlin_Kollwitzplatz.jpg",
    license: "cc-by-sa",
    attribution: "Gerd Danigel, ddr-fotograf.de, CC BY-SA 4.0",
  },
  mauerpark: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Mauerpark-Berlin-1.jpg",
    alt: "Südlicher Eingang des Mauerparks in Berlin",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Mauerpark-Berlin-1.jpg",
    license: "gfdl",
    attribution: "Georg Feitscher, GFDL / CC BY-SA 3.0",
  },
  kulturbrauerei: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Berlin-Kulturbrauerei.jpg",
    alt: "Kulturbrauerei in Berlin",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Berlin-Kulturbrauerei.jpg",
    license: "public-domain",
    attribution: "Kaspar Metz, Public Domain",
  },
  englischerGarten: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Englischer%20Garten%20from%20Monopteros.JPG",
    alt: "Blick über den Englischen Garten in München",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Englischer_Garten_from_Monopteros.JPG",
    license: "cc-by-sa",
    attribution: "Ludmiła Pilecka, CC BY-SA / GFDL",
  },
  volksparkFriedrichshain: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Berlin%20Volkspark%20Friedrichshain%20.jpg",
    alt: "Volkspark Friedrichshain in Berlin",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Berlin_Volkspark_Friedrichshain_.jpg",
    license: "cc-by",
    attribution: "Gerd Danigel, CC BY 3.0",
  },
} satisfies Record<string, LegalImage>;

const publicSignalProfiles: Record<string, PublicSignal[]> = {
  p1: [
    { key: "transit", label: "ÖPNV", score: 94, detail: "Sehr dichte Tram-/U-Bahn-/Busnähe" },
    { key: "safety", label: "Sicherheit", score: 68, detail: "Gebietsindikator aus Kriminalitätsdaten" },
    { key: "infrastructure", label: "Infrastruktur", score: 88, detail: "Viele Lebensmittel, Ärzte, Schulen und Kitas" },
    { key: "internet", label: "Internet", score: 78, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 86, detail: "Parks, Gastronomie, Kultur und Sport im Umfeld" },
  ],
  p2: [
    { key: "transit", label: "ÖPNV", score: 91, detail: "Sehr gute U-Bahn-/Busnähe" },
    { key: "safety", label: "Sicherheit", score: 82, detail: "Solider Gebietsindikator" },
    { key: "infrastructure", label: "Infrastruktur", score: 92, detail: "Sehr hohe Nahversorgungsdichte" },
    { key: "internet", label: "Internet", score: 85, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 88, detail: "Parks, Kultur und Gastronomie in Laufnähe" },
  ],
  p3: [
    { key: "transit", label: "ÖPNV", score: 88, detail: "Viele Schnellbahn-/Busoptionen" },
    { key: "safety", label: "Sicherheit", score: 58, detail: "Ausgehviertel mit erhöhtem Lageindikator" },
    { key: "infrastructure", label: "Infrastruktur", score: 84, detail: "Gute Nahversorgung und medizinische Angebote" },
    { key: "internet", label: "Internet", score: 82, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 90, detail: "Sehr hohe Kultur- und Gastronomiedichte" },
  ],
  p4: [
    { key: "transit", label: "ÖPNV", score: 93, detail: "Sehr gute U-/S-Bahn- und Tram-Anbindung" },
    { key: "safety", label: "Sicherheit", score: 63, detail: "Gebietsindikator aus Kriminalitätsdaten" },
    { key: "infrastructure", label: "Infrastruktur", score: 89, detail: "Hohe Dichte an Versorgung und Dienstleistungen" },
    { key: "internet", label: "Internet", score: 84, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 92, detail: "Sehr gute Freizeit-, Gastro- und Kulturangebote" },
  ],
  n1: [
    { key: "transit", label: "ÖPNV", score: 93, detail: "Sehr gute Tram-/U-Bahn- und Busabdeckung" },
    { key: "safety", label: "Sicherheit", score: 70, detail: "Gebietsindikator aus Kriminalitätsdaten" },
    { key: "infrastructure", label: "Infrastruktur", score: 90, detail: "Hohe Dichte an Schulen, Kitas, Ärzten und Einkauf" },
    { key: "internet", label: "Internet", score: 78, detail: "Breitband-/Gigabit-Verfügbarkeit auf Gebietsebene" },
    { key: "leisure", label: "Freizeit", score: 88, detail: "Parks, Cafés, Kultur und Sportangebote" },
  ],
  n2: [
    { key: "transit", label: "ÖPNV", score: 90, detail: "Sehr gute U-Bahn- und Busabdeckung" },
    { key: "safety", label: "Sicherheit", score: 84, detail: "Solider Gebietsindikator" },
    { key: "infrastructure", label: "Infrastruktur", score: 92, detail: "Sehr gute Versorgung, Schulen und Medizin" },
    { key: "internet", label: "Internet", score: 86, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 88, detail: "Gute Park-, Kultur- und Gastroabdeckung" },
  ],
  n3: [
    { key: "transit", label: "ÖPNV", score: 88, detail: "Sehr gute Schnellbahn-/Busnähe" },
    { key: "safety", label: "Sicherheit", score: 58, detail: "Ausgehviertel mit erhöhtem Lageindikator" },
    { key: "infrastructure", label: "Infrastruktur", score: 83, detail: "Gute Nahversorgung und medizinische Angebote" },
    { key: "internet", label: "Internet", score: 82, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 91, detail: "Sehr hohe Freizeit- und Kulturdichte" },
  ],
  n4: [
    { key: "transit", label: "ÖPNV", score: 94, detail: "Sehr gute U-/S-Bahn-, Tram- und Busabdeckung" },
    { key: "safety", label: "Sicherheit", score: 63, detail: "Gebietsindikator aus Kriminalitätsdaten" },
    { key: "infrastructure", label: "Infrastruktur", score: 89, detail: "Hohe Dichte an Versorgung, Schulen und Jobs" },
    { key: "internet", label: "Internet", score: 84, detail: "Gute Breitband-/Gigabit-Verfügbarkeit" },
    { key: "leisure", label: "Freizeit", score: 92, detail: "Sehr hohe Gastro-, Kultur- und Freizeitdichte" },
  ],
};

const infrastructureAmenities: InfrastructureAmenity[] = [
  { id: "a-p1-1", name: "EDEKA Kollwitzkiez", kind: "shop", latitude: 52.5389, longitude: 13.4149, targetIds: ["p1", "n1"] },
  { id: "a-p1-2", name: "Kita Kastanienhof", kind: "kita", latitude: 52.5419, longitude: 13.4109, targetIds: ["p1", "n1"] },
  { id: "a-p1-3", name: "Grundschule am Kollwitzplatz", kind: "school", latitude: 52.5377, longitude: 13.4178, targetIds: ["p1", "n1"] },
  { id: "a-p1-4", name: "Hausarztpraxis Prenzlauer Berg", kind: "doctor", latitude: 52.5425, longitude: 13.4154, targetIds: ["p1", "n1"] },
  { id: "a-p2-1", name: "REWE Leopoldstraße", kind: "shop", latitude: 48.1611, longitude: 11.5889, targetIds: ["p2", "n2"] },
  { id: "a-p2-2", name: "Kita Schwabinger Nest", kind: "kita", latitude: 48.1584, longitude: 11.5847, targetIds: ["p2", "n2"] },
  { id: "a-p2-3", name: "Grundschule an der Haimhauserstraße", kind: "school", latitude: 48.1628, longitude: 11.5921, targetIds: ["p2", "n2"] },
  { id: "a-p2-4", name: "Ärztehaus Münchner Freiheit", kind: "doctor", latitude: 48.1618, longitude: 11.5863, targetIds: ["p2", "n2"] },
  { id: "a-p3-1", name: "Bio Company Schanze", kind: "shop", latitude: 53.5595, longitude: 9.9604, targetIds: ["p3", "n3"] },
  { id: "a-p3-2", name: "Kita Sternschanze", kind: "kita", latitude: 53.5631, longitude: 9.9654, targetIds: ["p3", "n3"] },
  { id: "a-p3-3", name: "Ganztagsschule Sternschanze", kind: "school", latitude: 53.5568, longitude: 9.9685, targetIds: ["p3", "n3"] },
  { id: "a-p3-4", name: "Praxis Schulterblatt", kind: "doctor", latitude: 53.5607, longitude: 9.9632, targetIds: ["p3", "n3"] },
  { id: "a-p4-1", name: "Kaufland Karl-Marx-Allee", kind: "shop", latitude: 52.5173, longitude: 13.4512, targetIds: ["p4", "n4"] },
  { id: "a-p4-2", name: "Kita Friedrichshain Mitte", kind: "kita", latitude: 52.5138, longitude: 13.4487, targetIds: ["p4", "n4"] },
  { id: "a-p4-3", name: "Andreas-Grundschule", kind: "school", latitude: 52.5168, longitude: 13.4594, targetIds: ["p4", "n4"] },
  { id: "a-p4-4", name: "Ärztezentrum Frankfurter Tor", kind: "doctor", latitude: 52.5151, longitude: 13.4558, targetIds: ["p4", "n4"] },
];

const transitStations: TransitStation[] = [
  { id: "t-p1-1", name: "Eberswalder Straße", kind: "ubahn", lines: ["U2", "M10", "M1", "12"], latitude: 52.5413, longitude: 13.4128, targetIds: ["p1", "n1"] },
  { id: "t-p1-2", name: "Senefelderplatz", kind: "ubahn", lines: ["U2"], latitude: 52.5328, longitude: 13.4124, targetIds: ["p1", "n1"] },
  { id: "t-p1-3", name: "Schwedter Straße", kind: "tram", lines: ["M10"], latitude: 52.5401, longitude: 13.4095, targetIds: ["p1", "n1"] },
  { id: "t-p1-4", name: "Kollwitzplatz", kind: "tram", lines: ["M2"], latitude: 52.5361, longitude: 13.4183, targetIds: ["p1", "n1"] },
  { id: "t-p2-1", name: "Münchner Freiheit", kind: "ubahn", lines: ["U3", "U6", "Bus"], latitude: 48.1611, longitude: 11.5864, targetIds: ["p2", "n2"] },
  { id: "t-p2-2", name: "Giselastraße", kind: "ubahn", lines: ["U3", "U6"], latitude: 48.1577, longitude: 11.5847, targetIds: ["p2", "n2"] },
  { id: "t-p2-3", name: "Dietlindenstraße", kind: "ubahn", lines: ["U6"], latitude: 48.1666, longitude: 11.5923, targetIds: ["p2", "n2"] },
  { id: "t-p2-4", name: "Hohenzollernstraße", kind: "bus", lines: ["53", "59"], latitude: 48.1602, longitude: 11.5797, targetIds: ["p2", "n2"] },
  { id: "t-p3-1", name: "Sternschanze", kind: "sbahn", lines: ["S11", "S21", "S31", "U3"], latitude: 53.5640, longitude: 9.9696, targetIds: ["p3", "n3"] },
  { id: "t-p3-2", name: "Feldstraße", kind: "ubahn", lines: ["U3"], latitude: 53.5567, longitude: 9.9705, targetIds: ["p3", "n3"] },
  { id: "t-p3-3", name: "Schulterblatt", kind: "bus", lines: ["3", "602"], latitude: 53.5605, longitude: 9.9603, targetIds: ["p3", "n3"] },
  { id: "t-p3-4", name: "Messehallen", kind: "ubahn", lines: ["U2"], latitude: 53.5587, longitude: 9.9781, targetIds: ["p3", "n3"] },
  { id: "t-p4-1", name: "Weberwiese", kind: "ubahn", lines: ["U5"], latitude: 52.5168, longitude: 13.4441, targetIds: ["p4", "n4"] },
  { id: "t-p4-2", name: "Frankfurter Tor", kind: "ubahn", lines: ["U5", "M10", "21"], latitude: 52.5158, longitude: 13.4542, targetIds: ["p4", "n4"] },
  { id: "t-p4-3", name: "Warschauer Straße", kind: "sbahn", lines: ["S3", "S5", "S7", "S9", "U1", "U3"], latitude: 52.5054, longitude: 13.4492, targetIds: ["p4", "n4"] },
  { id: "t-p4-4", name: "Strausberger Platz", kind: "ubahn", lines: ["U5"], latitude: 52.5180, longitude: 13.4319, targetIds: ["p4", "n4"] },
];

const internetAvailability: InternetAvailability[] = [
  { id: "i-p1-1", targetId: "p1", provider: "Telekom", type: "dsl", downloadMbit: 250, uploadMbit: 40, status: "available", note: "VDSL/Supervectoring im Adressumfeld" },
  { id: "i-p1-2", targetId: "p1", provider: "Vodafone", type: "cable", downloadMbit: 1000, uploadMbit: 50, status: "available", note: "Kabelnetz im Gebäudeumfeld" },
  { id: "i-p1-3", targetId: "p1", provider: "Lokaler Glasfaserausbau", type: "fiber", downloadMbit: 1000, uploadMbit: 500, status: "planned", note: "FTTH-Ausbau als Gebietshinweis" },
  { id: "i-p2-1", targetId: "p2", provider: "Telekom", type: "dsl", downloadMbit: 250, uploadMbit: 40, status: "available", note: "VDSL/Supervectoring verfügbar" },
  { id: "i-p2-2", targetId: "p2", provider: "M-net", type: "fiber", downloadMbit: 1000, uploadMbit: 400, status: "available", note: "Glasfaser-/FTTB-Hinweis im Gebiet" },
  { id: "i-p2-3", targetId: "p2", provider: "Vodafone", type: "cable", downloadMbit: 1000, uploadMbit: 50, status: "available", note: "Kabelinternet im Gebiet" },
  { id: "i-p3-1", targetId: "p3", provider: "Telekom", type: "dsl", downloadMbit: 250, uploadMbit: 40, status: "available", note: "VDSL/Supervectoring im Umfeld" },
  { id: "i-p3-2", targetId: "p3", provider: "Vodafone", type: "cable", downloadMbit: 1000, uploadMbit: 50, status: "available", note: "Kabelinternet im Gebiet" },
  { id: "i-p3-3", targetId: "p3", provider: "wilhelm.tel", type: "fiber", downloadMbit: 1000, uploadMbit: 250, status: "limited", note: "Glasfaserhinweis je Hausanschluss prüfen" },
  { id: "i-p4-1", targetId: "p4", provider: "Telekom", type: "dsl", downloadMbit: 250, uploadMbit: 40, status: "available", note: "VDSL/Supervectoring verfügbar" },
  { id: "i-p4-2", targetId: "p4", provider: "Vodafone", type: "cable", downloadMbit: 1000, uploadMbit: 50, status: "available", note: "Kabelinternet im Gebäudeumfeld" },
  { id: "i-p4-3", targetId: "p4", provider: "DNS:NET", type: "fiber", downloadMbit: 1000, uploadMbit: 500, status: "planned", note: "Glasfaserausbau als Gebietshinweis" },
];

const leisurePlaces: LeisurePlace[] = [
  { id: "l-p1-1", name: "Kollwitzplatz", kind: "park", latitude: 52.5367, longitude: 13.4172, targetIds: ["p1", "n1"], media: { image: commonsImages.kollwitzplatz, websiteUrl: "https://www.google.com/maps/search/?api=1&query=Kollwitzplatz%20Berlin" } },
  { id: "l-p1-2", name: "Mauerpark", kind: "park", latitude: 52.5434, longitude: 13.4032, targetIds: ["p1", "n1"], media: { image: commonsImages.mauerpark, websiteUrl: "https://www.google.com/maps/search/?api=1&query=Mauerpark%20Berlin" } },
  { id: "l-p1-3", name: "Kulturbrauerei", kind: "culture", latitude: 52.5387, longitude: 13.4128, targetIds: ["p1", "n1"], media: { image: commonsImages.kulturbrauerei, websiteUrl: "https://www.kulturbrauerei.de/" } },
  {
    id: "l-p1-4",
    name: "Fitness Prenzlauer Berg",
    kind: "sport",
    latitude: 52.5398,
    longitude: 13.4162,
    targetIds: ["p1", "n1"],
    media: {
      websiteUrl: "https://www.greengymberlin.de/",
    },
  },
  { id: "l-p1-5", name: "Cafés Oderberger Straße", kind: "food", latitude: 52.5409, longitude: 13.4105, targetIds: ["p1", "n1"] },
  { id: "l-p2-1", name: "Englischer Garten", kind: "park", latitude: 48.1646, longitude: 11.6055, targetIds: ["p2", "n2"], media: { image: commonsImages.englischerGarten, websiteUrl: "https://www.schloesser.bayern.de/deutsch/garten/objekte/mu_engl.htm" } },
  { id: "l-p2-2", name: "Leopoldpark", kind: "park", latitude: 48.1658, longitude: 11.5812, targetIds: ["p2", "n2"] },
  { id: "l-p2-3", name: "Münchner Freiheit Gastronomie", kind: "food", latitude: 48.1613, longitude: 11.5867, targetIds: ["p2", "n2"] },
  { id: "l-p2-4", name: "ABC Kino", kind: "culture", latitude: 48.1596, longitude: 11.5831, targetIds: ["p2", "n2"] },
  { id: "l-p2-5", name: "Sportanlage Schwabing", kind: "sport", latitude: 48.1686, longitude: 11.5894, targetIds: ["p2", "n2"] },
  { id: "l-p3-1", name: "Schanzenpark", kind: "park", latitude: 53.5659, longitude: 9.9702, targetIds: ["p3", "n3"] },
  { id: "l-p3-2", name: "Rote Flora", kind: "culture", latitude: 53.5627, longitude: 9.9604, targetIds: ["p3", "n3"] },
  { id: "l-p3-3", name: "Schulterblatt Gastronomie", kind: "food", latitude: 53.5608, longitude: 9.9612, targetIds: ["p3", "n3"] },
  { id: "l-p3-4", name: "Bars Sternschanze", kind: "nightlife", latitude: 53.5596, longitude: 9.9638, targetIds: ["p3", "n3"] },
  { id: "l-p3-5", name: "Sporthalle Sternschanze", kind: "sport", latitude: 53.5582, longitude: 9.9686, targetIds: ["p3", "n3"] },
  { id: "l-p4-1", name: "Volkspark Friedrichshain", kind: "park", latitude: 52.5271, longitude: 13.4339, targetIds: ["p4", "n4"], media: { image: commonsImages.volksparkFriedrichshain, websiteUrl: "https://www.google.com/maps/search/?api=1&query=Volkspark%20Friedrichshain%20Berlin" } },
  { id: "l-p4-2", name: "RAW-Gelände", kind: "culture", latitude: 52.5078, longitude: 13.4542, targetIds: ["p4", "n4"] },
  { id: "l-p4-3", name: "Simon-Dach-Straße", kind: "food", latitude: 52.5102, longitude: 13.4588, targetIds: ["p4", "n4"] },
  { id: "l-p4-4", name: "Mercedes-Benz Arena Umfeld", kind: "culture", latitude: 52.5066, longitude: 13.4434, targetIds: ["p4", "n4"] },
  { id: "l-p4-5", name: "Sportpark Friedrichshain", kind: "sport", latitude: 52.5188, longitude: 13.4438, targetIds: ["p4", "n4"] },
];

const safetyObservations: SafetyObservation[] = [
  { id: "s-p1-1", title: "Ausgeh- und Fahrraddiebstahlbereich", category: "theft", riskLevel: "medium", casesPer1000: 62, trend: "stable", latitude: 52.5409, longitude: 13.4113, targetIds: ["p1", "n1"] },
  { id: "s-p1-2", title: "Ruhigere Wohnstraßen", category: "low", riskLevel: "low", casesPer1000: 34, trend: "falling", latitude: 52.5364, longitude: 13.4202, targetIds: ["p1", "n1"] },
  { id: "s-p2-1", title: "Zentrale Geschäftsachse", category: "theft", riskLevel: "medium", casesPer1000: 48, trend: "stable", latitude: 48.1610, longitude: 11.5867, targetIds: ["p2", "n2"] },
  { id: "s-p2-2", title: "Wohnquartier Schwabing", category: "low", riskLevel: "low", casesPer1000: 27, trend: "stable", latitude: 48.1662, longitude: 11.5928, targetIds: ["p2", "n2"] },
  { id: "s-p3-1", title: "Nachtleben-Hotspot", category: "nightlife", riskLevel: "elevated", casesPer1000: 79, trend: "rising", latitude: 53.5607, longitude: 9.9621, targetIds: ["p3", "n3"] },
  { id: "s-p3-2", title: "Schanzenpark Umfeld", category: "low", riskLevel: "medium", casesPer1000: 51, trend: "stable", latitude: 53.5655, longitude: 9.9705, targetIds: ["p3", "n3"] },
  { id: "s-p4-1", title: "Ausgeh- und Veranstaltungsumfeld", category: "nightlife", riskLevel: "elevated", casesPer1000: 74, trend: "stable", latitude: 52.5101, longitude: 13.4548, targetIds: ["p4", "n4"] },
  { id: "s-p4-2", title: "Karl-Marx-Allee Wohnachse", category: "traffic", riskLevel: "medium", casesPer1000: 55, trend: "falling", latitude: 52.5162, longitude: 13.4458, targetIds: ["p4", "n4"] },
];

const neighborhoodShapes: Record<string, { center: MapPoint; polygon: MapPoint[] }> = {
  n1: {
    center: { latitude: 52.5391, longitude: 13.4246 },
    polygon: [
      { latitude: 52.5468, longitude: 13.4128 },
      { latitude: 52.5485, longitude: 13.4278 },
      { latitude: 52.5416, longitude: 13.4398 },
      { latitude: 52.5316, longitude: 13.4357 },
      { latitude: 52.5302, longitude: 13.4176 },
      { latitude: 52.5386, longitude: 13.4098 },
    ],
  },
  n2: {
    center: { latitude: 48.1644, longitude: 11.5901 },
    polygon: [
      { latitude: 48.1719, longitude: 11.5761 },
      { latitude: 48.1739, longitude: 11.5956 },
      { latitude: 48.1654, longitude: 11.6067 },
      { latitude: 48.1538, longitude: 11.6032 },
      { latitude: 48.1534, longitude: 11.5821 },
      { latitude: 48.1625, longitude: 11.5732 },
    ],
  },
  n3: {
    center: { latitude: 53.5585, longitude: 9.9676 },
    polygon: [
      { latitude: 53.5629, longitude: 9.9551 },
      { latitude: 53.5653, longitude: 9.9689 },
      { latitude: 53.5612, longitude: 9.9789 },
      { latitude: 53.5544, longitude: 9.9803 },
      { latitude: 53.5519, longitude: 9.9651 },
      { latitude: 53.5564, longitude: 9.9542 },
    ],
  },
  n4: {
    center: { latitude: 52.5158, longitude: 13.4542 },
    polygon: [
      { latitude: 52.5218, longitude: 13.4378 },
      { latitude: 52.5224, longitude: 13.4628 },
      { latitude: 52.5163, longitude: 13.4736 },
      { latitude: 52.5091, longitude: 13.4703 },
      { latitude: 52.5084, longitude: 13.4452 },
      { latitude: 52.5142, longitude: 13.4345 },
    ],
  },
};

export function getPropertyAddress(property: Pick<Property, "street" | "house_number">): string {
  return `${property.street} ${property.house_number}`;
}

export function getPropertyAddressFromApi(property: { street: string; houseNumber: string }): string {
  return `${property.street} ${property.houseNumber}`;
}

// Coordinates and district shapes are not stored in the backend yet,
// so they are looked up locally by entity id.

export function getPropertyCoordinates(id: string): MapPoint | undefined {
  return propertyCoordinates[id];
}

/** Builds map markers for API properties that have known coordinates. */
export function toMappedProperties(apiProperties: ApiProperty[]): MappedProperty[] {
  return apiProperties.flatMap((apiProperty) => {
    const coordinates = propertyCoordinates[apiProperty.id];

    if (!coordinates) return [];

    return [{ ...adaptProperty(apiProperty), ...coordinates, publicSignals: publicSignalProfiles[apiProperty.id] }];
  });
}

/** Builds map areas for API neighborhoods that have a known shape. */
export function toMappedNeighborhoods(apiNeighborhoods: ApiNeighborhood[]): MappedNeighborhood[] {
  return apiNeighborhoods.flatMap((apiNeighborhood) => {
    const shape = neighborhoodShapes[apiNeighborhood.id];

    if (!shape) return [];

    return [{ ...adaptNeighborhood(apiNeighborhood), ...shape, publicSignals: publicSignalProfiles[apiNeighborhood.id] }];
  });
}

export function getInfrastructureAmenities(targetIds: string[]): InfrastructureAmenity[] {
  const targetIdSet = new Set(targetIds);

  return infrastructureAmenities.filter((amenity) =>
    amenity.targetIds.some((targetId) => targetIdSet.has(targetId)),
  );
}

export function getTransitStations(targetIds: string[]): TransitStation[] {
  const targetIdSet = new Set(targetIds);

  return transitStations.filter((station) =>
    station.targetIds.some((targetId) => targetIdSet.has(targetId)),
  );
}

export function getInternetAvailability(targetId: string): InternetAvailability[] {
  return internetAvailability.filter((entry) => entry.targetId === targetId);
}

export function getLeisurePlaces(targetIds: string[]): LeisurePlace[] {
  const targetIdSet = new Set(targetIds);

  return leisurePlaces.filter((place) =>
    place.targetIds.some((targetId) => targetIdSet.has(targetId)),
  );
}

export function getSafetyObservations(targetIds: string[]): SafetyObservation[] {
  const targetIdSet = new Set(targetIds);

  return safetyObservations.filter((observation) =>
    observation.targetIds.some((targetId) => targetIdSet.has(targetId)),
  );
}
