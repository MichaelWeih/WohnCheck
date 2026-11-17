import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { Baby, Building2, Briefcase, Bus, Dumbbell, ExternalLink, MapPin, Minus, Music, PanelRightClose, PanelRightOpen, Plus, RotateCcw, School, Shield, ShoppingCart, Stethoscope, Theater, Train, Trees, Utensils, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConsent } from "@/components/consent/ConsentProvider";
import {
  MapPoint,
  MappedNeighborhood,
  MappedProperty,
  PublicSignalKey,
  getInfrastructureAmenities,
  getInternetAvailability,
  getLeisurePlaces,
  getPropertyAddress,
  getSafetyObservations,
  getTransitStations,
} from "@/data/property-map-data";
import { cn } from "@/lib/utils";

type PropertyMapProps = {
  properties: MappedProperty[];
  neighborhoods?: MappedNeighborhood[];
  selectedPropertyId?: string;
  onSelectProperty?: (propertyId: string) => void;
  className?: string;
  heightClassName?: string;
  marketPrices?: {
    rent?: number | null;
    purchase?: number | null;
    locationLabel?: string;
  };
};

type Size = {
  width: number;
  height: number;
};

type PanOffset = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type SelectedPlace = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageLabel: string;
  latitude: number;
  longitude: number;
  linkLabel?: string;
  websiteUrl?: string;
  image?: {
    url: string;
    alt: string;
    sourceName: string;
    sourceUrl: string;
    license: string;
    attribution: string;
  };
};

const TILE_SIZE = 256;
const signalLayers: Array<{ key: PublicSignalKey; label: string; icon: typeof Train }> = [
  { key: "transit", label: "ÖPNV", icon: Train },
  { key: "safety", label: "Sicherheit", icon: Shield },
  { key: "infrastructure", label: "Infrastruktur", icon: Stethoscope },
  { key: "internet", label: "Internet", icon: Wifi },
  { key: "leisure", label: "Freizeit", icon: Trees },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lonToWorldX(lon: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return (scale * (1 - mercator / Math.PI)) / 2;
}

function getZoomLevel(points: MapPoint[], width: number, height: number) {
  if (points.length <= 1) return 14;

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const paddedLatSpan = Math.max((maxLat - minLat) * 1.45, 0.02);
  const paddedLonSpan = Math.max((maxLon - minLon) * 1.45, 0.02);

  for (let zoom = 15; zoom >= 4; zoom -= 1) {
    const left = lonToWorldX(minLon - paddedLonSpan / 2, zoom);
    const right = lonToWorldX(maxLon + paddedLonSpan / 2, zoom);
    const top = latToWorldY(maxLat + paddedLatSpan / 2, zoom);
    const bottom = latToWorldY(minLat - paddedLatSpan / 2, zoom);

    if (right - left <= width && bottom - top <= height) {
      return zoom;
    }
  }

  return 4;
}

function getScoreColor(score: number) {
  if (score >= 85) return "bg-emerald-600";
  if (score >= 70) return "bg-teal-600";
  if (score >= 55) return "bg-amber-500";
  return "bg-rose-600";
}

function getSignalScore(signals: MappedProperty["publicSignals"], activeLayer: PublicSignalKey) {
  return signals?.find((signal) => signal.key === activeLayer);
}

function formatMapPrice(value?: number | null, mode: "rent" | "purchase" = "rent") {
  if (value === null || value === undefined) return "–";

  if (mode === "purchase") {
    return `${Math.round(value).toLocaleString("de-DE")} €/m²`;
  }

  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m²`;
}

function getMapDetailLevel(zoom: number) {
  if (zoom < 11) {
    return {
      label: "Überblick",
      markerLimit: 0,
      description: "Wohnungen und Quartiere",
    };
  }

  if (zoom < 12) {
    return {
      label: "Basisdetails",
      markerLimit: 2,
      description: "wichtigste Punkte",
    };
  }

  if (zoom < 13) {
    return {
      label: "Mehr Details",
      markerLimit: 3,
      description: "zusätzliche Punkte",
    };
  }

  return {
    label: "Feindetails",
    markerLimit: Number.POSITIVE_INFINITY,
    description: "alle verfügbaren Punkte",
  };
}

function getMarkerPriority(id: string) {
  const suffix = Number(id.split("-").at(-1));
  return Number.isFinite(suffix) ? suffix : 1;
}

function isVisibleAtDetailLevel(id: string, markerLimit: number) {
  return getMarkerPriority(id) <= markerLimit;
}

const amenityIcons = {
  shop: ShoppingCart,
  kita: Baby,
  school: School,
  doctor: Stethoscope,
  work: Briefcase,
};

const amenityLabels = {
  shop: "Geschäft",
  kita: "Kita",
  school: "Schule",
  doctor: "Arzt",
  work: "Arbeitsplatz",
};

const stationIcons = {
  ubahn: Train,
  sbahn: Train,
  tram: Train,
  bus: Bus,
  rail: Train,
};

const stationLabels = {
  ubahn: "U-Bahn",
  sbahn: "S-Bahn",
  tram: "Tram",
  bus: "Bus",
  rail: "Bahn",
};

const internetTypeLabels = {
  dsl: "DSL",
  cable: "Kabel",
  fiber: "Glasfaser",
  mobile: "Mobilfunk",
};

const internetStatusLabels = {
  available: "verfügbar",
  planned: "geplant",
  limited: "eingeschränkt",
};

const leisureIcons = {
  park: Trees,
  culture: Theater,
  sport: Dumbbell,
  food: Utensils,
  nightlife: Music,
};

const leisureLabels = {
  park: "Park",
  culture: "Kultur",
  sport: "Sport",
  food: "Gastronomie",
  nightlife: "Nachtleben",
};

const safetyLabels = {
  theft: "Diebstahl",
  nightlife: "Nachtleben",
  traffic: "Verkehr",
  low: "Ruhigere Lage",
};

const riskLabels = {
  low: "niedrig",
  medium: "mittel",
  elevated: "erhöht",
};

const trendLabels = {
  falling: "sinkend",
  stable: "stabil",
  rising: "steigend",
};

function getRiskClass(riskLevel: keyof typeof riskLabels) {
  if (riskLevel === "elevated") return "bg-rose-600";
  if (riskLevel === "medium") return "bg-amber-500";
  return "bg-emerald-600";
}

function getPlaceImageUrl(place: SelectedPlace) {
  if (place.image) {
    return place.image.url;
  }

  const palette = getImagePalette(place.subtitle);
  const title = escapeSvgText(place.title);
  const subtitle = escapeSvgText(place.subtitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${palette.from}"/>
          <stop offset="100%" stop-color="${palette.to}"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <circle cx="88" cy="70" r="92" fill="#ffffff" opacity="0.18"/>
      <circle cx="568" cy="316" r="128" fill="#ffffff" opacity="0.14"/>
      <path d="M0 272 C110 225 201 304 315 256 C430 208 522 236 640 190 L640 360 L0 360 Z" fill="#ffffff" opacity="0.18"/>
      <g filter="url(#shadow)">
        <rect x="56" y="64" width="528" height="226" rx="18" fill="#ffffff" opacity="0.9"/>
        <rect x="86" y="98" width="112" height="112" rx="22" fill="${palette.accent}" opacity="0.18"/>
        <text x="142" y="165" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="${palette.accent}">${palette.symbol}</text>
        <text x="226" y="142" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0f172a">${subtitle}</text>
        <text x="226" y="181" font-family="Arial, sans-serif" font-size="31" font-weight="800" fill="#0f172a">${title}</text>
        <text x="226" y="222" font-family="Arial, sans-serif" font-size="15" fill="#475569">Vorschau für den Wohncheck-Kartenpunkt</text>
      </g>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getGoogleMapsUrl(place: Pick<SelectedPlace, "latitude" | "longitude" | "title">) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.title} ${place.latitude},${place.longitude}`)}`;
}

function getPlaceLinkUrl(place: SelectedPlace) {
  return place.websiteUrl ?? getGoogleMapsUrl(place);
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getImagePalette(subtitle: string) {
  if (subtitle.includes("Park")) {
    return { from: "#bbf7d0", to: "#0f766e", accent: "#047857", symbol: "P" };
  }
  if (subtitle.includes("Kultur")) {
    return { from: "#ddd6fe", to: "#7c3aed", accent: "#6d28d9", symbol: "K" };
  }
  if (subtitle.includes("Sport")) {
    return { from: "#fed7aa", to: "#ea580c", accent: "#c2410c", symbol: "S" };
  }
  if (subtitle.includes("Gastronomie") || subtitle.includes("Geschäft")) {
    return { from: "#fde68a", to: "#b45309", accent: "#b45309", symbol: "G" };
  }
  if (subtitle.includes("Kita") || subtitle.includes("Schule")) {
    return { from: "#bfdbfe", to: "#2563eb", accent: "#1d4ed8", symbol: "B" };
  }
  if (subtitle.includes("Arzt")) {
    return { from: "#ccfbf1", to: "#0d9488", accent: "#0f766e", symbol: "+" };
  }
  if (subtitle.includes("Bahn") || subtitle.includes("Bus") || subtitle.includes("Tram")) {
    return { from: "#bae6fd", to: "#0369a1", accent: "#0369a1", symbol: "H" };
  }
  if (subtitle.includes("Risiko")) {
    return { from: "#fecaca", to: "#b91c1c", accent: "#b91c1c", symbol: "!" };
  }

  return { from: "#e2e8f0", to: "#475569", accent: "#0f172a", symbol: "i" };
}

export function PropertyMap({
  properties,
  neighborhoods = [],
  selectedPropertyId,
  onSelectProperty,
  className,
  heightClassName = "h-[360px]",
  marketPrices,
}: PropertyMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 360 });
  const { canLoadExternalMedia, acceptAll } = useConsent();
  const [activeLayer, setActiveLayer] = useState<PublicSignalKey>("transit");
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [zoomOffset, setZoomOffset] = useState(0);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(true);

  useEffect(() => {
    if (!surfaceRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setSize({
        width: entry.contentRect.width || 800,
        height: entry.contentRect.height || 360,
      });
    });

    observer.observe(surfaceRef.current);
    return () => observer.disconnect();
  }, []);

  const selectedProperty =
    properties.find((property) => property.id === selectedPropertyId) ?? properties[0];
  const allPoints = [
    ...properties.map((property) => ({
      latitude: property.latitude,
      longitude: property.longitude,
    })),
    ...neighborhoods.flatMap((neighborhood) => neighborhood.polygon),
  ];

  if (properties.length === 0 && neighborhoods.length === 0) {
    return (
      <Card className={cn("flex items-center justify-center border-dashed p-8 text-sm text-muted-foreground", className)}>
        Keine Kartendaten vorhanden.
      </Card>
    );
  }

  const centerLat = allPoints.reduce((sum, point) => sum + point.latitude, 0) / allPoints.length;
  const centerLon = allPoints.reduce((sum, point) => sum + point.longitude, 0) / allPoints.length;
  const baseZoom = getZoomLevel(allPoints, size.width, size.height);
  const zoom = clamp(baseZoom + zoomOffset, 4, 18);
  const mapDetailLevel = getMapDetailLevel(zoom);
  const maxTileIndex = 2 ** zoom;
  const topLeftX = lonToWorldX(centerLon, zoom) - size.width / 2 - panOffset.x;
  const topLeftY = latToWorldY(centerLat, zoom) - size.height / 2 - panOffset.y;
  const startTileX = Math.floor(topLeftX / TILE_SIZE);
  const endTileX = Math.floor((topLeftX + size.width) / TILE_SIZE);
  const startTileY = Math.floor(topLeftY / TILE_SIZE);
  const endTileY = Math.floor((topLeftY + size.height) / TILE_SIZE);
  const tiles = [];

  for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      if (tileY < 0 || tileY >= maxTileIndex) continue;

      const wrappedX = ((tileX % maxTileIndex) + maxTileIndex) % maxTileIndex;

      tiles.push({
        key: `${wrappedX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        left: tileX * TILE_SIZE - topLeftX,
        top: tileY * TILE_SIZE - topLeftY,
      });
    }
  }

  const markers = properties.map((property) => ({
    ...property,
    left: lonToWorldX(property.longitude, zoom) - topLeftX,
    top: latToWorldY(property.latitude, zoom) - topLeftY,
  }));
  const amenityTargetIds = [...properties.map((property) => property.id), ...neighborhoods.map((neighborhood) => neighborhood.id)];
  const amenities = getInfrastructureAmenities(amenityTargetIds);
  const stations = getTransitStations(amenityTargetIds);
  const leisurePlaces = getLeisurePlaces(amenityTargetIds);
  const safetyObservations = getSafetyObservations(amenityTargetIds);
  const visibleAmenities = amenities.filter((amenity) =>
    isVisibleAtDetailLevel(amenity.id, mapDetailLevel.markerLimit),
  );
  const visibleStations = stations.filter((station) =>
    isVisibleAtDetailLevel(station.id, mapDetailLevel.markerLimit),
  );
  const visibleLeisurePlaces = leisurePlaces.filter((place) =>
    isVisibleAtDetailLevel(place.id, mapDetailLevel.markerLimit),
  );
  const visibleSafetyObservations = safetyObservations.filter((observation) =>
    isVisibleAtDetailLevel(observation.id, mapDetailLevel.markerLimit),
  );
  const amenityMarkers = visibleAmenities.map((amenity) => ({
    ...amenity,
    left: lonToWorldX(amenity.longitude, zoom) - topLeftX,
    top: latToWorldY(amenity.latitude, zoom) - topLeftY,
  }));
  const stationMarkers = visibleStations.map((station) => ({
    ...station,
    left: lonToWorldX(station.longitude, zoom) - topLeftX,
    top: latToWorldY(station.latitude, zoom) - topLeftY,
  }));
  const leisureMarkers = visibleLeisurePlaces.map((place) => ({
    ...place,
    left: lonToWorldX(place.longitude, zoom) - topLeftX,
    top: latToWorldY(place.latitude, zoom) - topLeftY,
  }));
  const safetyMarkers = visibleSafetyObservations.map((observation) => ({
    ...observation,
    left: lonToWorldX(observation.longitude, zoom) - topLeftX,
    top: latToWorldY(observation.latitude, zoom) - topLeftY,
  }));
  const visibleLayerMarkerCount =
    activeLayer === "transit"
      ? stationMarkers.length
      : activeLayer === "infrastructure"
        ? amenityMarkers.length
        : activeLayer === "leisure"
          ? leisureMarkers.length
          : activeLayer === "safety"
            ? safetyMarkers.length
            : 0;
  const mapDetailSummary =
    activeLayer === "internet" ? mapDetailLevel.description : `${visibleLayerMarkerCount} Punkte sichtbar`;
  const selectedAmenities = selectedProperty
    ? amenities.filter((amenity) => amenity.targetIds.includes(selectedProperty.id)).slice(0, 5)
    : [];
  const selectedStations = selectedProperty
    ? stations.filter((station) => station.targetIds.includes(selectedProperty.id)).slice(0, 5)
    : [];
  const selectedLeisurePlaces = selectedProperty
    ? leisurePlaces.filter((place) => place.targetIds.includes(selectedProperty.id)).slice(0, 6)
    : [];
  const selectedSafetyObservations = selectedProperty
    ? safetyObservations.filter((observation) => observation.targetIds.includes(selectedProperty.id)).slice(0, 4)
    : [];
  const selectedInternetOptions = selectedProperty ? getInternetAvailability(selectedProperty.id) : [];
  const hasMarketPrices = Boolean(
    marketPrices && (marketPrices.rent !== null && marketPrices.rent !== undefined || marketPrices.purchase !== null && marketPrices.purchase !== undefined),
  );
  const fastestInternetOption = selectedInternetOptions.reduce(
    (fastest, option) => (!fastest || option.downloadMbit > fastest.downloadMbit ? option : fastest),
    selectedInternetOptions[0],
  );
  const neighborhoodPolygons = neighborhoods.map((neighborhood) => ({
    ...neighborhood,
    points: neighborhood.polygon
      .map((point) => {
        const x = lonToWorldX(point.longitude, zoom) - topLeftX;
        const y = latToWorldY(point.latitude, zoom) - topLeftY;

        return `${x},${y}`;
      })
      .join(" "),
    labelLeft: lonToWorldX(neighborhood.center.longitude, zoom) - topLeftX,
    labelTop: latToWorldY(neighborhood.center.latitude, zoom) - topLeftY,
  }));

  const handleMapPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canLoadExternalMedia || event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, a, [data-map-control='true']")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
    });
  };

  const handleMapPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    setPanOffset({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    });
  };

  const handleMapPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragState(null);
  };

  const openPanelWithPlace = (place: SelectedPlace) => {
    setSelectedPlace(place);
    setIsDetailPanelOpen(true);
  };

  const handlePropertySelect = (propertyId: string) => {
    setSelectedPlace(null);
    setIsDetailPanelOpen(true);
    onSelectProperty?.(propertyId);
  };

  return (
    <Card className={cn("overflow-hidden border-border/70 bg-card", className)}>
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Wohnungen auf der Karte</h3>
            <p className="text-sm text-muted-foreground">
              {properties.length} Gebäude und {neighborhoods.length} Nachbarschaften
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>{mapDetailLevel.label}</span>
              <span className="h-1 w-1 rounded-full bg-primary/60" />
              <span>{mapDetailSummary}</span>
            </div>
          </div>
          {hasMarketPrices && (
            <div className="hidden shrink-0 grid-cols-2 gap-2 lg:grid">
              <div className="rounded-lg border bg-background px-3 py-2 text-right">
                <div className="text-[11px] text-muted-foreground">Miete</div>
                <div className="text-sm font-bold text-foreground">{formatMapPrice(marketPrices?.rent, "rent")}</div>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2 text-right">
                <div className="text-[11px] text-muted-foreground">Kauf</div>
                <div className="text-sm font-bold text-foreground">{formatMapPrice(marketPrices?.purchase, "purchase")}</div>
              </div>
            </div>
          )}
          {selectedProperty && (
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen((isOpen) => !isOpen)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {isDetailPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                {isDetailPanelOpen ? "Panel einklappen" : "Panel öffnen"}
              </button>
              <Link
                to={`/gebaeude/${selectedProperty.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Detailseite
              </Link>
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {signalLayers.map((layer) => {
            const Icon = layer.icon;
            const isActive = layer.key === activeLayer;

            return (
              <button
                key={layer.key}
                type="button"
                onClick={() => {
                  setActiveLayer(layer.key);
                  setSelectedPlace(null);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={13} />
                {layer.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={surfaceRef}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerUp}
        onPointerCancel={handleMapPointerUp}
        className={cn(
          "relative w-full touch-none overflow-hidden bg-slate-100",
          "bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.18),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0))]",
          canLoadExternalMedia && (dragState ? "cursor-grabbing" : "cursor-grab"),
          heightClassName,
        )}
      >
        {hasMarketPrices && !isDetailPanelOpen && (
          <div
            data-map-control="true"
            className="absolute right-3 top-3 z-30 rounded-xl border border-border/80 bg-white/95 p-3 shadow-lg backdrop-blur"
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              {marketPrices?.locationLabel ?? "Marktpreise"}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-muted-foreground">Miete</div>
                <div className="text-base font-bold text-foreground">{formatMapPrice(marketPrices?.rent, "rent")}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Kauf</div>
                <div className="text-base font-bold text-foreground">{formatMapPrice(marketPrices?.purchase, "purchase")}</div>
              </div>
            </div>
          </div>
        )}
        <div className="absolute inset-0">
          {canLoadExternalMedia &&
            tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.src}
                alt=""
                className="absolute h-64 w-64 max-w-none select-none"
                style={{ left: tile.left, top: tile.top }}
                draggable={false}
              />
            ))}
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-slate-950/10" />

        {!canLoadExternalMedia && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-sm">
            <div className="max-w-md rounded-2xl border border-border bg-card/95 p-6 text-center shadow-xl">
              <p className="text-sm font-semibold text-foreground">
                Kartenansicht erst nach Zustimmung
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Damit OpenStreetMap geladen werden kann, benötigen wir deine Einwilligung
                für externe Inhalte. Ohne Zustimmung bleibt die Karte blockiert.
              </p>
              <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                <Button onClick={acceptAll}>Karte erlauben</Button>
                <Button asChild variant="outline">
                  <Link to="/datenschutz">Mehr erfahren</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {canLoadExternalMedia && (
          <div
            data-map-control="true"
            className="absolute left-3 top-3 z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-white/95 shadow-lg backdrop-blur"
            aria-label="Karten-Zoom"
          >
            <button
              type="button"
              onClick={() => setZoomOffset((offset) => Math.min(offset + 1, 4))}
              className="flex h-9 w-9 items-center justify-center border-b border-border text-foreground hover:bg-secondary"
              aria-label="In die Karte hineinzoomen"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setZoomOffset((offset) => Math.max(offset - 1, -4))}
              className="flex h-9 w-9 items-center justify-center border-b border-border text-foreground hover:bg-secondary"
              aria-label="Aus der Karte herauszoomen"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomOffset(0);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="flex h-10 w-9 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-none text-muted-foreground hover:bg-secondary"
              aria-label="Zoom und Kartenposition zurücksetzen"
            >
              <RotateCcw size={13} />
              {zoom}
            </button>
          </div>
        )}

        {neighborhoodPolygons.length > 0 && (
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {neighborhoodPolygons.map((neighborhood) => (
              <polygon
                key={neighborhood.id}
                points={neighborhood.points}
                fill="rgba(20, 184, 166, 0.16)"
                stroke="rgba(13, 148, 136, 0.95)"
                strokeWidth="3"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}

        {neighborhoodPolygons.map((neighborhood) => (
          <div
            key={`${neighborhood.id}-label`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: neighborhood.labelLeft, top: neighborhood.labelTop }}
          >
            <span className="rounded-full border border-primary/30 bg-white/90 px-3 py-1 text-xs font-semibold text-foreground shadow-md backdrop-blur">
              {neighborhood.district_name}
              {getSignalScore(neighborhood.publicSignals, activeLayer) && (
                <span className="ml-1 text-primary">
                  {getSignalScore(neighborhood.publicSignals, activeLayer)?.score}
                </span>
              )}
            </span>
          </div>
        ))}

        {markers.map((property) => {
          const isSelected = property.id === selectedProperty?.id;
          const activeSignal = getSignalScore(property.publicSignals, activeLayer);

          return (
            <button
              key={property.id}
              type="button"
              onClick={() => handlePropertySelect(property.id)}
              className="group absolute -translate-x-1/2 -translate-y-full"
              style={{ left: property.left, top: property.top }}
              aria-label={`${getPropertyAddress(property)} auswählen`}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-4 border-white text-white shadow-lg transition-all",
                  isSelected ? "scale-110" : "group-hover:scale-105",
                  activeSignal ? getScoreColor(activeSignal.score) : "bg-slate-900/85",
                )}
              >
                {activeLayer === "infrastructure" ? <Building2 size={18} /> : <MapPin size={18} />}
              </span>
              <span
                className={cn(
                  "mt-2 block rounded-full px-3 py-1 text-xs font-semibold shadow-md",
                  isSelected ? "bg-white text-foreground" : "bg-white/90 text-foreground/80",
                )}
              >
                {activeSignal ? activeSignal.score : property.rating_overall.toFixed(1)}
              </span>
            </button>
          );
        })}

        {activeLayer === "infrastructure" &&
          amenityMarkers.map((amenity) => {
            const Icon = amenityIcons[amenity.kind];

            return (
              <button
                key={amenity.id}
                type="button"
                onClick={() =>
                  openPanelWithPlace({
                    id: amenity.id,
                    title: amenity.name,
                    subtitle: amenityLabels[amenity.kind],
                    description: `${amenityLabels[amenity.kind]} im direkten Wohnumfeld der ausgewählten Adresse.`,
                    imageLabel: `${amenityLabels[amenity.kind]} ${amenity.name}`,
                    latitude: amenity.latitude,
                    longitude: amenity.longitude,
                    websiteUrl: amenity.media?.websiteUrl,
                    image: amenity.media?.image,
                  })
                }
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: amenity.left, top: amenity.top }}
                aria-label={`${amenityLabels[amenity.kind]} ${amenity.name} anzeigen`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-white bg-white text-primary shadow-lg"
                  title={`${amenityLabels[amenity.kind]}: ${amenity.name}`}
                >
                  <Icon size={15} />
                </span>
                <span className="pointer-events-none absolute left-1/2 top-9 hidden w-max max-w-[180px] -translate-x-1/2 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground shadow-md group-hover:block">
                  {amenity.name}
                </span>
              </button>
            );
          })}

        {activeLayer === "transit" &&
          stationMarkers.map((station) => {
            const Icon = stationIcons[station.kind];

            return (
              <button
                key={station.id}
                type="button"
                onClick={() =>
                  openPanelWithPlace({
                    id: station.id,
                    title: station.name,
                    subtitle: `${stationLabels[station.kind]} · ${station.lines.join(", ")}`,
                    description: `Station mit Linien ${station.lines.join(", ")} im Umfeld der ausgewählten Adresse.`,
                    imageLabel: `${stationLabels[station.kind]} ${station.name}`,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    websiteUrl: station.media?.websiteUrl,
                    image: station.media?.image,
                  })
                }
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: station.left, top: station.top }}
                aria-label={`${stationLabels[station.kind]} ${station.name} anzeigen`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-sky-700 text-white shadow-lg"
                  title={`${stationLabels[station.kind]}: ${station.name} · ${station.lines.join(", ")}`}
                >
                  <Icon size={15} />
                </span>
                <span className="pointer-events-none absolute left-1/2 top-9 hidden w-max max-w-[200px] -translate-x-1/2 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground shadow-md group-hover:block">
                  {station.name} · {station.lines.join(", ")}
                </span>
              </button>
            );
          })}

        {activeLayer === "leisure" &&
          leisureMarkers.map((place) => {
            const Icon = leisureIcons[place.kind];

            return (
              <button
                key={place.id}
                type="button"
                onClick={() =>
                  openPanelWithPlace({
                    id: place.id,
                    title: place.name,
                    subtitle: leisureLabels[place.kind],
                    description: `${leisureLabels[place.kind]} im Freizeitprofil der Lage.`,
                    imageLabel: `${leisureLabels[place.kind]} ${place.name}`,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    websiteUrl: place.media?.websiteUrl,
                    image: place.media?.image,
                  })
                }
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: place.left, top: place.top }}
                aria-label={`${leisureLabels[place.kind]} ${place.name} anzeigen`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-white bg-emerald-700 text-white shadow-lg"
                  title={`${leisureLabels[place.kind]}: ${place.name}`}
                >
                  <Icon size={15} />
                </span>
                <span className="pointer-events-none absolute left-1/2 top-9 hidden w-max max-w-[200px] -translate-x-1/2 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground shadow-md group-hover:block">
                  {place.name}
                </span>
              </button>
            );
          })}

        {activeLayer === "safety" &&
          safetyMarkers.map((observation) => (
            <button
              key={observation.id}
              type="button"
              onClick={() =>
                openPanelWithPlace({
                  id: observation.id,
                  title: observation.title,
                  subtitle: `${safetyLabels[observation.category]} · Risiko ${riskLabels[observation.riskLevel]}`,
                  description: `${observation.casesPer1000} Fälle je 1.000 Einwohner im Demo-Indikator, Trend ${trendLabels[observation.trend]}.`,
                  imageLabel: `Sicherheitslage ${safetyLabels[observation.category]}`,
                  latitude: observation.latitude,
                  longitude: observation.longitude,
                  linkLabel: "Lage prüfen",
                  websiteUrl: observation.media?.websiteUrl,
                  image: observation.media?.image,
                })
              }
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: observation.left, top: observation.top }}
              aria-label={`${observation.title} anzeigen`}
            >
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border-2 border-white text-white shadow-lg ring-4 ring-white/45",
                  getRiskClass(observation.riskLevel),
                )}
                title={`${observation.title}: ${observation.casesPer1000} Fälle je 1.000 Einwohner`}
              >
                <Shield size={17} />
              </span>
              <span className="pointer-events-none absolute left-1/2 top-12 hidden w-max max-w-[210px] -translate-x-1/2 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground shadow-md group-hover:block">
                {observation.title} · {riskLabels[observation.riskLevel]}
              </span>
            </button>
          ))}

        {selectedProperty && (
          <div
            data-map-control="true"
            className={cn(
              "absolute bottom-3 left-3 right-3 top-3 z-30 transition-transform duration-300 ease-out md:left-auto md:w-80",
              isDetailPanelOpen ? "translate-x-0" : "translate-x-[calc(100%-3.25rem)]",
            )}
          >
            <div className="relative h-full overflow-hidden rounded-lg border border-white/70 bg-white/95 shadow-xl backdrop-blur">
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(true)}
                className={cn(
                  "absolute left-0 top-0 z-10 flex h-full w-12 flex-col items-center justify-center gap-2 border-r border-border/70 bg-white/95 text-primary transition-opacity hover:bg-secondary",
                  isDetailPanelOpen ? "pointer-events-none opacity-0" : "opacity-100",
                )}
                aria-label="Panel öffnen"
                aria-expanded={isDetailPanelOpen}
              >
                <PanelRightOpen size={18} />
                <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold uppercase tracking-[0.18em]">
                  Details
                </span>
              </button>

              <div
                aria-hidden={!isDetailPanelOpen}
                className={cn(
                  "h-full overflow-y-auto p-3 transition-opacity duration-200",
                  isDetailPanelOpen ? "opacity-100 delay-100" : "pointer-events-none opacity-0",
                )}
              >
                <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsDetailPanelOpen(false)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <PanelRightClose size={13} />
                  Panel einklappen
                </button>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Ausgewählte Wohnung
              </p>
              <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                {getPropertyAddress(selectedProperty)}
              </h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedProperty.postal_code} {selectedProperty.city}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {getSignalScore(selectedProperty.publicSignals, activeLayer)?.label ?? "Score"}{" "}
                  {getSignalScore(selectedProperty.publicSignals, activeLayer)?.score ?? selectedProperty.rating_overall.toFixed(1)}
                </span>
                <span className="text-muted-foreground">
                  {selectedProperty.review_count} Bewertungen
                </span>
              </div>
              {getSignalScore(selectedProperty.publicSignals, activeLayer) && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {getSignalScore(selectedProperty.publicSignals, activeLayer)?.detail}
                </p>
              )}
              {selectedPlace && (
                <div className="mt-3 overflow-hidden rounded-md border border-border/70 bg-white">
                  <div className="relative aspect-[16/9] overflow-hidden bg-secondary">
                    <img
                      src={getPlaceImageUrl(selectedPlace)}
                      alt={selectedPlace.image?.alt ?? `${selectedPlace.title} Vorschau`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedPlace(null)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground shadow"
                      aria-label="Ortsdetails schließen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{selectedPlace.title}</p>
                        <p className="text-xs text-muted-foreground">{selectedPlace.subtitle}</p>
                      </div>
                      <a
                        href={getPlaceLinkUrl(selectedPlace)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                      >
                        <ExternalLink size={12} />
                        {selectedPlace.linkLabel ?? "Maps"}
                      </a>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {selectedPlace.description}
                    </p>
                    {selectedPlace.image ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Bild:{" "}
                        <a
                          href={selectedPlace.image.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {selectedPlace.image.sourceName}
                        </a>
                        {" · "}
                        {selectedPlace.image.license} · {selectedPlace.image.attribution}
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Lokales Vorschaubild, weil noch kein rechtssicher lizenziertes Foto
                        hinterlegt ist.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {activeLayer === "safety" && selectedSafetyObservations.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  {selectedSafetyObservations.map((observation) => (
                    <button
                      key={observation.id}
                      type="button"
                      onClick={() =>
                        openPanelWithPlace({
                          id: observation.id,
                          title: observation.title,
                          subtitle: `${safetyLabels[observation.category]} · Risiko ${riskLabels[observation.riskLevel]}`,
                          description: `${observation.casesPer1000} Fälle je 1.000 Einwohner im Demo-Indikator, Trend ${trendLabels[observation.trend]}.`,
                          imageLabel: `Sicherheitslage ${safetyLabels[observation.category]}`,
                          latitude: observation.latitude,
                          longitude: observation.longitude,
                          linkLabel: "Lage prüfen",
                          websiteUrl: observation.media?.websiteUrl,
                          image: observation.media?.image,
                        })
                      }
                      className="flex items-center gap-2 rounded-md text-left text-xs text-foreground hover:bg-secondary/70"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-white",
                          getRiskClass(observation.riskLevel),
                        )}
                      >
                        <Shield size={12} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {observation.title} · {riskLabels[observation.riskLevel]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {activeLayer === "infrastructure" && selectedAmenities.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  {selectedAmenities.map((amenity) => {
                    const Icon = amenityIcons[amenity.kind];

                    return (
                      <div key={amenity.id} className="flex items-center gap-2 text-xs text-foreground">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                          <Icon size={12} />
                        </span>
                        <span className="truncate">{amenity.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {activeLayer === "transit" && selectedStations.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  {selectedStations.map((station) => {
                    const Icon = stationIcons[station.kind];

                    return (
                      <div key={station.id} className="flex items-center gap-2 text-xs text-foreground">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-sky-100 text-sky-700">
                          <Icon size={12} />
                        </span>
                        <span className="truncate">
                          {station.name} · {station.lines.join(", ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {activeLayer === "internet" && selectedInternetOptions.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {fastestInternetOption && (
                    <div className="rounded-md bg-primary/10 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-primary">Max. Download</span>
                        <span className="text-sm font-bold text-foreground">
                          {fastestInternetOption.downloadMbit} Mbit/s
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Upload bis {fastestInternetOption.uploadMbit} Mbit/s ·{" "}
                        {internetTypeLabels[fastestInternetOption.type]}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-1.5">
                    {selectedInternetOptions.map((option) => (
                      <div key={option.id} className="rounded-md border border-border/70 px-2 py-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">
                            {internetTypeLabels[option.type]} · {option.provider}
                          </span>
                          <span className="text-muted-foreground">{internetStatusLabels[option.status]}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{option.downloadMbit}/{option.uploadMbit} Mbit/s</span>
                          <Wifi size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeLayer === "leisure" && selectedLeisurePlaces.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  {selectedLeisurePlaces.map((place) => {
                    const Icon = leisureIcons[place.kind];

                    return (
                      <div key={place.id} className="flex items-center gap-2 text-xs text-foreground">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-100 text-emerald-700">
                          <Icon size={12} />
                        </span>
                        <span className="truncate">
                          {place.name} · {leisureLabels[place.kind]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
        <span>
          Layer: {signalLayers.find((layer) => layer.key === activeLayer)?.label} · {mapDetailLevel.label}
        </span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground"
        >
          Karten: OpenStreetMap
        </a>
      </div>
    </Card>
  );
}
