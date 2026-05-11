import { Injectable } from "@nestjs/common";

type MarketPriceMetric = {
  value: number | null;
  unit: "EUR_M2";
  label: string;
  sourceKey: string;
  year: number;
  quality: "official" | "official-report" | "derived";
  granularity: "city" | "district" | "postal-code";
};

type MarketPriceSource = {
  key: string;
  name: string;
  url: string;
  note: string;
};

type CityMarket = {
  city: string;
  rent: MarketPriceMetric;
  purchase: MarketPriceMetric;
  districtAdjustments?: Record<string, Partial<Pick<MarketPriceMetric, "value" | "sourceKey" | "quality">> & {
    note: string;
  }>;
  postalCodeAdjustments?: Record<string, {
    rent?: Partial<Pick<MarketPriceMetric, "value" | "label" | "sourceKey" | "year" | "quality">>;
    purchase?: Partial<Pick<MarketPriceMetric, "value" | "label" | "sourceKey" | "year" | "quality" | "granularity">>;
    note: string;
    sourceKeys?: string[];
  }>;
  sources: MarketPriceSource[];
};

const MARKET_DATA: CityMarket[] = [
  {
    city: "Berlin",
    rent: {
      value: 7.21,
      unit: "EUR_M2",
      label: "Ortsübliche Vergleichsmiete nettokalt",
      sourceKey: "berlin-mietspiegel-2024",
      year: 2024,
      quality: "official",
      granularity: "city",
    },
    purchase: {
      value: 5251,
      unit: "EUR_M2",
      label: "Mittlerer Kaufpreis Eigentumswohnungen",
      sourceKey: "berlin-gaa-2024-2025",
      year: 2024,
      quality: "official-report",
      granularity: "city",
    },
    districtAdjustments: {
      "prenzlauer berg": {
        note: "Bezirksteil erkannt. Berlin weist Mietspiegelwerte primär nach Wohnlage, Baualter und Ausstattung aus; deshalb wird der amtliche Stadtwert als belastbarer Basiswert gezeigt.",
      },
      friedrichshain: {
        note: "Bezirksteil erkannt. Berlin weist Mietspiegelwerte primär nach Wohnlage, Baualter und Ausstattung aus; deshalb wird der amtliche Stadtwert als belastbarer Basiswert gezeigt.",
      },
    },
    sources: [
      {
        key: "berlin-mietspiegel-2024",
        name: "Berliner Mietspiegel 2024",
        url: "https://www.berlin.de/sen/wohnen/service/berliner-mietspiegel/",
        note: "Amtliche ortsübliche Vergleichsmiete; keine Angebotsmiete.",
      },
      {
        key: "berlin-gaa-2024-2025",
        name: "Gutachterausschuss Berlin, Immobilienmarktbericht 2024/2025",
        url: "https://www.berlin.de/gutachterausschuss/marktinformationen/marktanalyse/artikel.175633.php",
        note: "Auswertung notariell beurkundeter Kaufverträge.",
      },
      {
        key: "ibb-wmb-2024",
        name: "IBB Wohnungsmarktbericht 2024",
        url: "https://www.ibb.de/de/ueber-uns/publikationen/wohnungsmarktbericht/2024.html",
        note: "Ergänzende Einordnung von Angebotsmieten und Angebotskaufpreisen.",
      },
    ],
  },
  {
    city: "Hamburg",
    rent: {
      value: 9.94,
      unit: "EUR_M2",
      label: "Mittlere Nettokaltmiete",
      sourceKey: "hamburg-mietenspiegel-2025",
      year: 2025,
      quality: "official",
      granularity: "city",
    },
    purchase: {
      value: null,
      unit: "EUR_M2",
      label: "Kaufpreis Eigentumswohnungen",
      sourceKey: "hamburg-gaa-2024",
      year: 2024,
      quality: "official-report",
      granularity: "city",
    },
    sources: [
      {
        key: "hamburg-mietenspiegel-2025",
        name: "Hamburger Mietenspiegel 2025",
        url: "https://www.hamburg.de/politik-und-verwaltung/senat/presseservice-des-senats/landespressekonferenz/mietenspiegel-2025-1126144",
        note: "Amtlicher Mietenspiegel; Nettokaltmieten.",
      },
      {
        key: "hamburg-gaa-2024",
        name: "Gutachterausschuss Hamburg, Immobilienmarktbericht 2024",
        url: "https://www.hamburg.de/politik-und-verwaltung/behoerden/behoerde-fuer-stadtentwicklung-und-wohnen/themen/wohnen/immobilienmarktbericht",
        note: "Amtliche Kaufpreissammlung; Wert wird erst nach strukturierter Tabellenübernahme angezeigt.",
      },
    ],
  },
  {
    city: "München",
    rent: {
      value: 15.38,
      unit: "EUR_M2",
      label: "Durchschnittliche ortsübliche Nettomiete",
      sourceKey: "muenchen-mietspiegel-2025",
      year: 2025,
      quality: "official",
      granularity: "city",
    },
    purchase: {
      value: 8350,
      unit: "EUR_M2",
      label: "Durchschnitt Bestands-Eigentumswohnungen",
      sourceKey: "muenchen-gaa-2024",
      year: 2024,
      quality: "official-report",
      granularity: "city",
    },
    sources: [
      {
        key: "muenchen-mietspiegel-2025",
        name: "Mietspiegel München 2025",
        url: "https://stadt.muenchen.de/service/info/mietspiegel/10208632/",
        note: "Qualifizierter Mietspiegel der Landeshauptstadt München.",
      },
      {
        key: "muenchen-gaa-2024",
        name: "Gutachterausschuss München, Immobilienmarktbericht 2024",
        url: "https://stadt.muenchen.de/infos/immobilienmarktbericht.html",
        note: "Marktbericht des Gutachterausschusses; Kaufpreiswert als Vorschau für Bestandswohnungen.",
      },
    ],
  },
  {
    city: "Dortmund",
    rent: {
      value: 8.97,
      unit: "EUR_M2",
      label: "Median Angebotsmiete Bestandswohnungen nettokalt",
      sourceKey: "dortmund-wohnungsmarktbericht-2025",
      year: 2024,
      quality: "official-report",
      granularity: "city",
    },
    purchase: {
      value: 4550,
      unit: "EUR_M2",
      label: "Durchschnitt Neubau-Eigentumswohnungen",
      sourceKey: "dortmund-gaa-2026",
      year: 2026,
      quality: "official-report",
      granularity: "city",
    },
    postalCodeAdjustments: {
      "44263": {
        rent: {
          value: 11.22,
          label: "PLZ-Mietpreis nettokalt",
          sourceKey: "miet-check-44263-2025",
          year: 2025,
          quality: "derived",
        },
        purchase: {
          value: 2895,
          label: "Stadtteil-Kaufpreis Eigentumswohnungen",
          sourceKey: "immowelt-hoerde-2026",
          year: 2026,
          quality: "derived",
          granularity: "district",
        },
        sourceKeys: ["miet-check-44263-2025", "immowelt-hoerde-2026"],
        note: "PLZ 44263 wurde berücksichtigt. Die Miete nutzt einen PLZ-basierten Mietpreisindikator, der Kaufpreis einen Hörde-Stadtteilwert; amtliche Stadtwerte bleiben als Kontextquelle sichtbar.",
      },
    },
    sources: [
      {
        key: "dortmund-wohnungsmarktbericht-2025",
        name: "Stadt Dortmund, Wohnungsmarktbericht 2025",
        url: "https://www.dortmund.de/dortmund/projekte/rathaus/verwaltung/amt-fuer-wohnen/downloads/wohnungsmarktbeobachtung/64-01-25-wohnungsmarktbericht_web.pdf",
        note: "Wohnungsmarktbeobachtung der Stadt Dortmund; Median Wiedervermietung 2024.",
      },
      {
        key: "dortmund-gaa-2026",
        name: "Gutachterausschuss Dortmund, Grundstücksmarktbericht 2026",
        url: "https://www.dortmund.de/newsroom/nachrichten-dortmund.de/der-aufwaertstrend-auf-dem-dortmunder-grundstuecksmarkt-setzt-sich-fort.html",
        note: "Presseinformation des Gutachterausschusses Dortmund zu aktuellen Durchschnittspreisen.",
      },
      {
        key: "miet-check-44263-2025",
        name: "Miet-Check, PLZ 44263",
        url: "https://www.miet-check.de/mietpreis-plz/44263/",
        note: "PLZ-basierter Mietpreisindikator aus Angebots- und Nutzerdaten; nicht amtlicher Mietspiegel.",
      },
      {
        key: "immowelt-hoerde-2026",
        name: "Immowelt Immobilienpreise Hörde",
        url: "https://www.immowelt.de/immobilienpreise/dortmund-hoerde",
        note: "Stadtteilbasierter Angebotspreis für Eigentumswohnungen; keine Kaufpreissammlung.",
      },
    ],
  },
];

@Injectable()
export class MarketPricesProvider {
  getPreview(city = "Berlin", district?: string, postalCode?: string) {
    const cityMarket = this.findCity(city);
    const normalizedPostalCode = this.normalizePostalCode(postalCode);

    if (!cityMarket) {
      return {
        city: city.trim(),
        district: district?.trim() || null,
        postalCode: normalizedPostalCode,
        available: false,
        rent: null,
        purchase: null,
        sources: [],
        note: "Für diese Stadt ist noch kein kuratierter Marktdaten-Satz hinterlegt.",
      };
    }

    const normalizedDistrict = district?.trim().toLocaleLowerCase("de-DE");
    const districtAdjustment = normalizedDistrict
      ? cityMarket.districtAdjustments?.[normalizedDistrict]
      : undefined;
    const postalCodeAdjustment = normalizedPostalCode
      ? cityMarket.postalCodeAdjustments?.[normalizedPostalCode]
      : undefined;

    return {
      city: cityMarket.city,
      district: district?.trim() || null,
      postalCode: normalizedPostalCode,
      available: true,
      rent: this.applyAdjustment(cityMarket.rent, districtAdjustment, postalCodeAdjustment?.rent, postalCodeAdjustment?.rent ? "postal-code" : undefined),
      purchase: this.applyAdjustment(cityMarket.purchase, districtAdjustment, postalCodeAdjustment?.purchase, postalCodeAdjustment?.purchase?.granularity),
      sources: cityMarket.sources,
      note: postalCodeAdjustment?.note ?? districtAdjustment?.note ?? (
        normalizedPostalCode
          ? `Für PLZ ${normalizedPostalCode} liegt noch kein kuratierter PLZ-Wert vor; angezeigt wird der beste verfügbare Stadt-/Bezirkswert mit transparenter Granularität.`
          : "Stadtwert aus amtlicher oder gutachterlicher Quelle. Bezirkswerte werden nur angezeigt, wenn sie quellenbasiert strukturiert vorliegen."
      ),
    };
  }

  private findCity(city: string) {
    const normalizedCity = city.trim().toLocaleLowerCase("de-DE");
    return MARKET_DATA.find((entry) => entry.city.toLocaleLowerCase("de-DE") === normalizedCity);
  }

  private normalizePostalCode(postalCode?: string) {
    const match = postalCode?.match(/\b\d{5}\b/);
    return match?.[0] ?? null;
  }

  private applyAdjustment(
    metric: MarketPriceMetric,
    ...adjustments: Array<(Partial<Pick<MarketPriceMetric, "value" | "label" | "sourceKey" | "year" | "quality" | "granularity">> | undefined | string)>
  ) {
    const merged = adjustments.reduce<Partial<MarketPriceMetric>>((current, adjustment) => {
      if (!adjustment) return current;
      if (typeof adjustment === "string") return { ...current, granularity: adjustment as MarketPriceMetric["granularity"] };
      return { ...current, ...adjustment };
    }, {});

    return {
      ...metric,
      ...merged,
    };
  }
}
