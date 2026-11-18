import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MappedNeighborhood, MappedProperty } from "@/data/property-map-data";
import { resultRoutes } from "@/features/directory/routes";
import { addressQueryUrl } from "@/features/location/api";
import type { MapObject } from "@/features/location/MapRenderer";

const MapRenderer = lazy(() =>
  import("@/features/location/MapRenderer").then((m) => ({
    default: m.MapRenderer,
  })),
);

const propertyAddress = (property: MappedProperty) =>
  `${property.street} ${property.house_number}, ${property.postal_code} ${property.city}`;

/**
 * Map of directory objects (buildings and neighbourhoods) for the search and the building page.
 * It uses the same MapLibre renderer as the address check and shows the existing object markers only;
 * real places around an address are part of the address check, which every building links to.
 */
export function ObjectMap({
  properties,
  neighborhoods = [],
  selectedPropertyId,
  onSelectProperty,
  linkToDetails = true,
}: {
  properties: MappedProperty[];
  neighborhoods?: MappedNeighborhood[];
  selectedPropertyId?: string;
  onSelectProperty?: (propertyId: string) => void;
  /** False on the page of the object itself. */
  linkToDetails?: boolean;
}) {
  const [selectedArea, setSelectedArea] = useState<string>();
  const objects = useMemo<MapObject[]>(
    () => [
      ...neighborhoods.map((neighborhood) => ({
        id: `neighborhood:${neighborhood.id}`,
        latitude: neighborhood.center.latitude,
        longitude: neighborhood.center.longitude,
        label: `Wohngegend ${neighborhood.district_name}, ${neighborhood.city}`,
        kind: "area" as const,
        outline: neighborhood.polygon,
      })),
      ...properties.map((property) => ({
        id: `property:${property.id}`,
        latitude: property.latitude,
        longitude: property.longitude,
        label: `Gebäude ${propertyAddress(property)}`,
        kind: "property" as const,
      })),
    ],
    [properties, neighborhoods],
  );
  const property = properties.find((item) => item.id === selectedPropertyId);
  const neighborhood = property
    ? undefined
    : neighborhoods.find((item) => item.id === selectedArea);
  const selected = property
    ? `property:${property.id}`
    : neighborhood
      ? `neighborhood:${neighborhood.id}`
      : undefined;

  return (
    <div className="object-map">
      <Suspense
        fallback={
          <p role="status" className="state-message">
            Karte wird geladen …
          </p>
        }
      >
        <MapRenderer
          objects={objects}
          selected={selected}
          onSelect={(id) => {
            const [kind, objectId] = id.split(/:(.*)/s);
            if (kind === "property") {
              setSelectedArea(undefined);
              onSelectProperty?.(objectId);
            } else {
              onSelectProperty?.("");
              setSelectedArea(objectId);
            }
          }}
          label="Karte der Wohnorte"
          consentText="Zum Laden der Karte werden Verbindungen zu OpenFreeMap hergestellt. Die Einträge der Liste kannst du auch ohne Karte öffnen."
        />
      </Suspense>
      {property && (
        <div className="object-map-selection" aria-live="polite">
          <strong>{propertyAddress(property)}</strong>
          <span>
            {linkToDetails && (
              <Link className="text-link" to={resultRoutes.property + property.id}>
                Zum Gebäude
              </Link>
            )}
            <Link
              className="text-link"
              to={addressQueryUrl(propertyAddress(property))}
            >
              Umgebung dieser Adresse prüfen
            </Link>
          </span>
        </div>
      )}
      {neighborhood && (
        <div className="object-map-selection" aria-live="polite">
          <strong>
            {neighborhood.district_name}, {neighborhood.city}
          </strong>
          <span>
            <Link
              className="text-link"
              to={resultRoutes.neighborhood + neighborhood.id}
            >
              Zur Wohngegend
            </Link>
          </span>
        </div>
      )}
      <p className="object-map-note">
        Karte: OpenFreeMap © OpenMapTiles, Daten © OpenStreetMap-Mitwirkende.
        Positionen der Einträge sind Näherungen.
      </p>
    </div>
  );
}
