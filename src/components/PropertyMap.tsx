import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConsent } from "@/components/consent/ConsentProvider";
import {
  MapPoint,
  MappedNeighborhood,
  MappedProperty,
  getPropertyAddress,
} from "@/data/property-map-data";
import { cn } from "@/lib/utils";

type PropertyMapProps = {
  properties: MappedProperty[];
  neighborhoods?: MappedNeighborhood[];
  selectedPropertyId?: string;
  onSelectProperty?: (propertyId: string) => void;
  className?: string;
  heightClassName?: string;
};

type Size = {
  width: number;
  height: number;
};

const TILE_SIZE = 256;

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

export function PropertyMap({
  properties,
  neighborhoods = [],
  selectedPropertyId,
  onSelectProperty,
  className,
  heightClassName = "h-[360px]",
}: PropertyMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 360 });
  const { canLoadExternalMedia, acceptAll } = useConsent();

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
  const zoom = getZoomLevel(allPoints, size.width, size.height);
  const maxTileIndex = 2 ** zoom;
  const topLeftX = lonToWorldX(centerLon, zoom) - size.width / 2;
  const topLeftY = latToWorldY(centerLat, zoom) - size.height / 2;
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
    left: clamp(lonToWorldX(property.longitude, zoom) - topLeftX, 18, size.width - 18),
    top: clamp(latToWorldY(property.latitude, zoom) - topLeftY, 18, size.height - 18),
  }));
  const neighborhoodPolygons = neighborhoods.map((neighborhood) => ({
    ...neighborhood,
    points: neighborhood.polygon
      .map((point) => {
        const x = lonToWorldX(point.longitude, zoom) - topLeftX;
        const y = latToWorldY(point.latitude, zoom) - topLeftY;

        return `${x},${y}`;
      })
      .join(" "),
    labelLeft: clamp(lonToWorldX(neighborhood.center.longitude, zoom) - topLeftX, 64, size.width - 64),
    labelTop: clamp(latToWorldY(neighborhood.center.latitude, zoom) - topLeftY, 24, size.height - 24),
  }));

  return (
    <Card className={cn("overflow-hidden border-border/70 bg-card", className)}>
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Wohnungen auf der Karte</h3>
            <p className="text-sm text-muted-foreground">
              {properties.length} Gebäude und {neighborhoods.length} Nachbarschaften
            </p>
          </div>
          {selectedProperty && (
            <Link
              to={`/gebaeude/${selectedProperty.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Details öffnen
            </Link>
          )}
        </div>
      </div>

      <div
        ref={surfaceRef}
        className={cn(
          "relative w-full overflow-hidden bg-slate-100",
          "bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.18),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0))]",
          heightClassName,
        )}
      >
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

        {neighborhoodPolygons.length > 0 && (
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {neighborhoodPolygons.map((neighborhood) => (
              <polygon
                key={neighborhood.id}
                points={neighborhood.points}
                fill="rgba(20, 184, 166, 0.14)"
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
            </span>
          </div>
        ))}

        {markers.map((property) => {
          const isSelected = property.id === selectedProperty?.id;

          return (
            <button
              key={property.id}
              type="button"
              onClick={() => onSelectProperty?.(property.id)}
              className="group absolute -translate-x-1/2 -translate-y-full"
              style={{ left: property.left, top: property.top }}
              aria-label={`${getPropertyAddress(property)} auswählen`}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-4 border-white text-white shadow-lg transition-all",
                  isSelected ? "scale-110 bg-primary" : "bg-slate-900/85 group-hover:scale-105",
                )}
              >
                <MapPin size={18} />
              </span>
              <span
                className={cn(
                  "mt-2 block rounded-full px-3 py-1 text-xs font-semibold shadow-md",
                  isSelected ? "bg-white text-foreground" : "bg-white/90 text-foreground/80",
                )}
              >
                {property.rating_overall.toFixed(1)}
              </span>
            </button>
          );
        })}

        {selectedProperty && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:w-72">
            <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Ausgewählte Wohnung
              </p>
              <h4 className="mt-2 text-base font-semibold text-foreground">
                {getPropertyAddress(selectedProperty)}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedProperty.postal_code} {selectedProperty.city}
              </p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  Score {selectedProperty.rating_overall.toFixed(1)}
                </span>
                <span className="text-muted-foreground">
                  {selectedProperty.review_count} Bewertungen
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
        <span>Marker zeigen Gebäude, Flächen markieren Nachbarschaften.</span>
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
