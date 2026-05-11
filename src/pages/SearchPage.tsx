import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMappedNeighborhoods, getMappedProperties } from "@/data/property-map-data";
import type { MappedProperty, PublicSignal } from "@/data/property-map-data";
import { PropertyMap } from "@/components/PropertyMap";
import { MarketPricePreview } from "@/components/MarketPricePreview";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adaptSearchResults } from "@/features/directory/directory-adapter";
import { fetchAddressScoreContext, fetchMarketPrices, searchDirectory } from "@/features/directory/directory-api";
import type { AddressScoreContextResponse, MarketPricesResponse } from "@/features/directory/directory-types";
import { searchAll } from "@/data/mock-data";
import { Building2, CheckCircle2, Euro, ExternalLink, Home, MapPin, Navigation, Sparkles } from "lucide-react";

const typeLabels: Record<string, string> = {
  landlord: "Vermieter",
  property: "Gebäude",
  neighborhood: "Nachbarschaft",
};

const typeIcons: Record<string, typeof Building2> = {
  landlord: Building2,
  property: Home,
  neighborhood: MapPin,
};

const typeRoutes: Record<string, string> = {
  landlord: "/vermieter/",
  property: "/gebaeude/",
  neighborhood: "/nachbarschaft/",
};

type SearchResultType = keyof typeof typeLabels;

const allowedTypeFilters = new Set<SearchResultType>(["landlord", "property", "neighborhood"]);

function formatMarketValue(value?: number | null, mode: "rent" | "purchase" = "rent") {
  if (value === null || value === undefined) return "noch offen";

  if (mode === "purchase") {
    return `${Math.round(value).toLocaleString("de-DE")} €/m²`;
  }

  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m²`;
}

function describeLevel(score?: number) {
  if (score === undefined) return "noch nicht belastbar bewertbar";
  if (score >= 85) return "sehr stark";
  if (score >= 70) return "gut";
  if (score >= 50) return "solide";
  if (score > 0) return "ausbaufähig";
  return "nicht ausreichend belegt";
}

const priceGranularityLabels: Record<NonNullable<MarketPricesResponse["rent"]>["granularity"], string> = {
  "postal-code": "PLZ",
  district: "Stadtteil",
  city: "Stadt",
};

function AddressLocationSummary({
  label,
  city,
  district,
  postalCode,
  scoreContext,
  marketPrices,
}: {
  label: string;
  city?: string | null;
  district?: string | null;
  postalCode?: string | null;
  scoreContext?: AddressScoreContextResponse;
  marketPrices?: MarketPricesResponse;
}) {
  const scorePreview = scoreContext?.scorePreview;
  const transit = scorePreview?.components.transit;
  const infrastructure = scorePreview?.components.infrastructure;
  const leisure = scorePreview?.components.leisure;
  const locationName = [postalCode, district, city].filter(Boolean).join(", ") || label;

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.03]">
      <div className="p-6 md:p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
          <Sparkles size={16} />
          Wohnlage-Zusammenfassung
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div>
            <h2 className="text-2xl font-bold leading-tight text-foreground">{locationName}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              Für diese Suche gibt es noch keine konkrete WohnCheck-Wohnung im Verzeichnis. Aus Live-Umfelddaten
              ergibt sich aber eine erste Lageeinschätzung: Die ÖPNV-Anbindung wirkt {describeLevel(transit)}, die
              Infrastruktur ist {describeLevel(infrastructure)} und Freizeit-/Grünangebote sind {describeLevel(leisure)} belegt.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">WohnCheck-Umfeldscore</div>
            <div className="mt-1 text-4xl font-bold text-foreground">{scorePreview?.total ?? "–"}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Datenvertrauen {scorePreview?.confidence ?? "–"} · Radius {scoreContext?.radiusMeters ?? 1500} m
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "ÖPNV", value: transit, icon: Navigation },
            { label: "Infrastruktur", value: infrastructure, icon: CheckCircle2 },
            { label: "Freizeit", value: leisure, icon: Sparkles },
            {
              label: "Miete",
              value: formatMarketValue(marketPrices?.rent?.value, "rent"),
              detail: marketPrices?.rent ? `${marketPrices.rent.year} · ${priceGranularityLabels[marketPrices.rent.granularity]}` : undefined,
              icon: Euro,
            },
            {
              label: "Kauf",
              value: formatMarketValue(marketPrices?.purchase?.value, "purchase"),
              detail: marketPrices?.purchase ? `${marketPrices.purchase.year} · ${priceGranularityLabels[marketPrices.purchase.granularity]}` : undefined,
              icon: Euro,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border bg-background px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon size={14} />
                  {item.label}
                </div>
                <div className="mt-1 text-lg font-bold text-foreground">
                  {typeof item.value === "number" ? item.value : item.value ?? "–"}
                </div>
                {"detail" in item && item.detail && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const requestedType = params.get("type");
  const typeFilter: SearchResultType | null =
    requestedType && allowedTypeFilters.has(requestedType as SearchResultType)
      ? (requestedType as SearchResultType)
      : null;
  const latitudeParam = params.get("lat");
  const longitudeParam = params.get("lon");
  const addressLabel = params.get("address") || query;
  const selectedCity = params.get("city");
  const selectedDistrict = params.get("district");
  const selectedPostalCode = params.get("postalCode") ?? addressLabel.match(/\b\d{5}\b/)?.[0] ?? null;
  const selectedLatitude = latitudeParam ? Number(latitudeParam) : null;
  const selectedLongitude = longitudeParam ? Number(longitudeParam) : null;
  const { data: apiResults } = useQuery({
    queryKey: ["directory-search", query],
    queryFn: () => searchDirectory(query),
    enabled: Boolean(query.trim()),
  });

  const fallbackResults = useMemo(() => searchAll(query), [query]);
  const unfilteredResults = apiResults ? adaptSearchResults(apiResults) : fallbackResults;
  const results = typeFilter
    ? unfilteredResults.filter((result) => result.type === typeFilter)
    : unfilteredResults;
  const { data: addressScoreContext, isFetching: isAddressScoreLoading } = useQuery({
    queryKey: ["address-score-context", selectedLatitude, selectedLongitude, addressLabel],
    queryFn: () =>
      fetchAddressScoreContext({
        latitude: selectedLatitude ?? 0,
        longitude: selectedLongitude ?? 0,
        label: addressLabel,
      }),
    enabled: Number.isFinite(selectedLatitude) && Number.isFinite(selectedLongitude),
    staleTime: 1000 * 60 * 10,
  });
  const { data: marketPrices } = useQuery({
    queryKey: ["market-prices", selectedCity, selectedDistrict, selectedPostalCode],
    queryFn: () => fetchMarketPrices({
      city: selectedCity ?? "",
      district: selectedDistrict,
      postalCode: selectedPostalCode,
    }),
    enabled: Boolean(selectedCity),
    staleTime: 1000 * 60 * 60,
  });

  const propertyResults = getMappedProperties().filter((property) =>
    results.some((result) => result.type === "property" && result.id === property.id),
  );
  const neighborhoodResults = getMappedNeighborhoods().filter((neighborhood) =>
    results.some((result) => result.type === "neighborhood" && result.id === neighborhood.id),
  );
  const addressMapProperty = useMemo<MappedProperty | null>(() => {
    if (!Number.isFinite(selectedLatitude) || !Number.isFinite(selectedLongitude)) {
      return null;
    }

    const scorePreview = addressScoreContext?.scorePreview;
    const signals: PublicSignal[] = [
      {
        key: "transit",
        label: "ÖPNV",
        score: scorePreview?.components.transit ?? 0,
        detail: "Live-Umfelddaten im gewählten Radius",
      },
      {
        key: "infrastructure",
        label: "Infrastruktur",
        score: scorePreview?.components.infrastructure ?? 0,
        detail: "Versorgung, Bildung und Medizin im Umfeld",
      },
      {
        key: "leisure",
        label: "Freizeit",
        score: scorePreview?.components.leisure ?? 0,
        detail: "Freizeit- und Grünflächenangebote im Umfeld",
      },
      {
        key: "safety",
        label: "Sicherheit",
        score: scorePreview ? Math.max(50, Math.round(scorePreview.confidence * 0.72)) : 0,
        detail: "Noch ohne amtliche Sicherheitsdaten, vorläufig aus Datenvertrauen abgeleitet",
      },
      {
        key: "internet",
        label: "Internet",
        score: scorePreview ? Math.max(50, Math.round(scorePreview.total * 0.82)) : 0,
        detail: "Internetdaten werden als externer Provider ergänzt",
      },
    ];

    const [street = addressLabel, houseNumber = ""] = addressLabel.split(",")[0]?.split(/ (?=\d)/) ?? [addressLabel, ""];

    return {
      id: "address-search-result",
      street,
      house_number: houseNumber,
      postal_code: selectedPostalCode ?? "",
      city: selectedCity ?? "",
      landlord_id: "address-search",
      landlord_name: "Adresssuche",
      rating_overall: scorePreview ? Number((scorePreview.total / 20).toFixed(1)) : 0,
      review_count: 0,
      ratings: {},
      latitude: selectedLatitude ?? 0,
      longitude: selectedLongitude ?? 0,
      publicSignals: signals,
    };
  }, [addressLabel, addressScoreContext?.scorePreview, selectedCity, selectedLatitude, selectedLongitude, selectedPostalCode]);
  const cityNeighborhoods = useMemo(() => {
    if (!addressMapProperty) return [];

    const normalizedCity = selectedCity?.toLocaleLowerCase("de-DE");
    const normalizedDistrict = selectedDistrict?.toLocaleLowerCase("de-DE");

    return getMappedNeighborhoods()
      .filter((neighborhood) => {
        const cityMatches = normalizedCity
          ? neighborhood.city.toLocaleLowerCase("de-DE") === normalizedCity
          : true;
        const districtMatches = normalizedDistrict
          ? neighborhood.district_name.toLocaleLowerCase("de-DE").includes(normalizedDistrict)
          : false;

        return cityMatches || districtMatches;
      })
      .sort((a, b) => {
        if (!normalizedDistrict) return 0;
        const aMatches = a.district_name.toLocaleLowerCase("de-DE").includes(normalizedDistrict);
        const bMatches = b.district_name.toLocaleLowerCase("de-DE").includes(normalizedDistrict);
        return Number(bMatches) - Number(aMatches);
      });
  }, [addressMapProperty, selectedCity, selectedDistrict]);
  const mapProperties = addressMapProperty ? [addressMapProperty, ...propertyResults] : propertyResults;
  const mapNeighborhoods = addressMapProperty && neighborhoodResults.length === 0 ? cityNeighborhoods : neighborhoodResults;
  const hasMapData = mapProperties.length > 0 || mapNeighborhoods.length > 0;
  const isAddressOnlyView = Boolean(addressMapProperty) && results.length === 0;
  const propertyResultIds = mapProperties.map((property) => property.id).join("|");
  const firstPropertyId = addressMapProperty?.id ?? mapProperties[0]?.id;
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(firstPropertyId);

  useEffect(() => {
    setSelectedPropertyId((currentPropertyId) => {
      if (currentPropertyId && propertyResults.some((property) => property.id === currentPropertyId)) {
        return currentPropertyId;
      }

      return firstPropertyId;
    });
  }, [firstPropertyId, propertyResultIds, propertyResults]);

  return (
    <div className="container py-10">
      <div className="mx-auto mb-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-foreground">
          {typeFilter === "landlord" && query ? `Vermieter in ${query}` : `Suchergebnisse${query && ` für "${query}"`}`}
        </h1>
      </div>

      {!isAddressOnlyView && (addressScoreContext || isAddressScoreLoading) && (
        <Card className="mx-auto mb-6 max-w-3xl border-primary/25 bg-primary/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                <Navigation size={13} />
                Adress-Umfeld
              </div>
              <h2 className="text-sm font-semibold text-foreground">{addressScoreContext?.label ?? addressLabel}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {addressScoreContext
                  ? `Radius ${addressScoreContext.radiusMeters} m · ${addressScoreContext.source.fromCache ? "aus Cache" : "live geladen"}`
                  : "Umfelddaten werden geladen..."}
              </p>
            </div>
            <div className="shrink-0 rounded-lg border bg-card px-3 py-2 text-center">
              <div className="text-[11px] text-muted-foreground">Score-Vorschau</div>
              <div className="text-xl font-bold text-foreground">
                {addressScoreContext?.scorePreview?.total ?? "–"}
              </div>
            </div>
          </div>
          {addressScoreContext?.scorePreview && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              <span>ÖPNV {addressScoreContext.scorePreview.components.transit}</span>
              <span>Infrastruktur {addressScoreContext.scorePreview.components.infrastructure}</span>
              <span>Freizeit {addressScoreContext.scorePreview.components.leisure}</span>
              <span>Datenvertrauen {addressScoreContext.scorePreview.confidence}</span>
            </div>
          )}
        </Card>
      )}

      {!isAddressOnlyView && <MarketPricePreview data={marketPrices} className="mx-auto mb-6 max-w-3xl" />}

      {isAddressOnlyView && hasMapData ? (
        <div className="space-y-6">
          <AddressLocationSummary
            label={addressLabel}
            city={selectedCity}
            district={selectedDistrict}
            postalCode={selectedPostalCode}
            scoreContext={addressScoreContext}
            marketPrices={marketPrices}
          />
          <div>
            <PropertyMap
              properties={mapProperties}
              neighborhoods={mapNeighborhoods}
              selectedPropertyId={selectedPropertyId}
              onSelectProperty={setSelectedPropertyId}
              heightClassName="h-[720px]"
              marketPrices={{
                rent: marketPrices?.rent?.value,
                purchase: marketPrices?.purchase?.value,
                locationLabel: [selectedPostalCode, selectedDistrict, selectedCity].filter(Boolean).join(", ") || "Marktpreise",
              }}
            />
          </div>
        </div>
      ) : results.length === 0 && !hasMapData ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">Keine Ergebnisse gefunden.</p>
          <p className="text-sm text-muted-foreground mt-2">Versuche einen anderen Suchbegriff.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_560px] xl:items-start">
          <div className="max-w-3xl space-y-3 xl:max-w-none">
            {results.length === 0 && (
              <Card className="p-5">
                <h2 className="font-semibold text-foreground">Keine internen Treffer</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Für diese Adresse zeigen wir trotzdem den WohnCheck-Umfeldscore und die Karte mit allen Layern.
                </p>
              </Card>
            )}
            {results.map((result) => {
              const Icon = typeIcons[result.type];
              const isSelectedProperty = result.type === "property" && result.id === selectedPropertyId;
              const resultCard = (
                <Card
                  className={`flex items-center gap-4 p-5 transition-all hover:shadow-md ${
                    isSelectedProperty ? "border-primary shadow-md ring-1 ring-primary/20" : ""
                  }`}
                >
                  <ScoreBadge score={result.rating} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <h3 className="truncate font-semibold text-foreground">{result.title}</h3>
                      <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                        <Icon size={12} /> {typeLabels[result.type]}
                      </Badge>
                      {result.sourceLabel && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                          <ExternalLink size={12} /> Öffentliche Quelle
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{result.subtitle}</p>
                    {result.sourceLabel ? (
                      <p className="mt-1 text-xs text-muted-foreground">Quelle: {result.sourceLabel}</p>
                    ) : (
                      <div className="mt-1 flex items-center gap-2">
                        <StarRating rating={result.rating} size={13} />
                        <span className="text-xs text-muted-foreground">{result.reviewCount} Bewertungen</span>
                      </div>
                    )}
                  </div>
                </Card>
              );

              return (
                <Link
                  to={
                    result.type === "landlord"
                      ? `${typeRoutes[result.type]}${encodeURIComponent(result.id)}${result.sourceCandidate ? `?city=${encodeURIComponent(result.city)}` : ""}`
                      : `${typeRoutes[result.type]}${result.id}`
                  }
                  key={`${result.type}-${result.id}`}
                  onMouseEnter={() => result.type === "property" && setSelectedPropertyId(result.id)}
                >
                  {resultCard}
                </Link>
              );
            })}
          </div>

          {hasMapData && (
            <div className="xl:sticky xl:top-24">
              <PropertyMap
                properties={mapProperties}
                neighborhoods={mapNeighborhoods}
              selectedPropertyId={selectedPropertyId}
              onSelectProperty={setSelectedPropertyId}
              heightClassName="h-[560px]"
              marketPrices={marketPrices ? {
                rent: marketPrices.rent?.value,
                purchase: marketPrices.purchase?.value,
                locationLabel: [selectedPostalCode, selectedDistrict, selectedCity].filter(Boolean).join(", ") || "Marktpreise",
              } : undefined}
            />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
