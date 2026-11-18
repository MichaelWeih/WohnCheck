import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LandlordAtAddress } from "@/components/landlord/LandlordAtAddress";
import { AddressSearch } from "./AddressSearch";
import {
  addressParams,
  addressSearch,
  locationErrorText,
  nearbyPlaces,
} from "./api";
import { CategoryFilters } from "./CategoryFilters";
import { LocationSummary } from "./LocationSummary";
import type { MapPoint } from "./MapRenderer";
import { PlaceDetails } from "./PlaceDetails";
import { PlacesPanel } from "./PlacesPanel";
import { RadiusSelect } from "./RadiusSelect";
import {
  CategoryIssueReason,
  NearbyPlacesResponse,
  PLACE_GROUPS,
  PlaceCategory,
  PlaceKind,
  ResolvedAddress,
} from "./types";
import {
  ALL_CATEGORIES,
  DEFAULT_RADIUS,
  PlaceSort,
  accuracyLabel,
  addressFromParams,
  categoriesFromParams,
  categoryColors,
  displayCategory,
  formatRadius,
  groupPlaces,
  kindsFromParams,
  placeItemId,
  radiusFromParams,
  visiblePlaces,
} from "./utils";
import "./location.css";

const MapRenderer = lazy(() =>
  import("./MapRenderer").then((m) => ({ default: m.MapRenderer })),
);

const ADDRESS_KEYS = [
  "address",
  "lat",
  "lng",
  "accuracy",
  "street",
  "houseNumber",
  "postalCode",
  "city",
  "country",
];
const issueText: Record<CategoryIssueReason, string> = {
  limit: "Limit von 500 Orten erreicht, weitere Orte sind möglich",
  timeout: "nicht geladen (Zeitüberschreitung)",
  quota: "nicht geladen (Kontingent ausgeschöpft)",
  error: "nicht geladen (Kartendienst nicht erreichbar)",
};

/**
 * Address check: one confirmed address, its surroundings on the map and the same places as a list.
 * The URL holds address, coordinates, radius and filters, so links, reloads and the browser history
 * restore the same state. The address stays the centre; moving the map changes nothing.
 */
export default function LocationExplorer() {
  const [params, setParams] = useSearchParams();
  const serialized = params.toString();
  const addressKey = JSON.stringify(ADDRESS_KEYS.map((key) => params.get(key)));
  const address = useMemo(
    () => addressFromParams(new URLSearchParams(serialized)),
    // Only the address parameters decide; filter changes must not create a new address object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addressKey],
  );
  const radius = radiusFromParams(params);
  const categoryParam = params.get("categories");
  const kindParam = params.get("kinds");
  const categories = useMemo(
    () =>
      categoriesFromParams(
        new URLSearchParams(
          categoryParam === null ? "" : { categories: categoryParam },
        ),
      ),
    [categoryParam],
  );
  const kinds = useMemo(
    () => kindsFromParams(new URLSearchParams({ kinds: kindParam ?? "" })),
    [kindParam],
  );

  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<"map" | "list">("map");
  const [sort, setSort] = useState<PlaceSort>("distance");
  const [mapAvailable, setMapAvailable] = useState(true);
  const details = useRef<HTMLElement>(null);
  const focusDetails = useRef(false);

  const lat = address?.latitude;
  const lon = address?.longitude;
  const nearby = useQuery({
    queryKey: ["nearby-places", lat, lon, radius],
    queryFn: ({ signal }) => nearbyPlaces(address!, radius, signal),
    enabled: !!address,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  // The last loaded result of the *same* address stays visible while another radius loads or after
  // a failed reload. A different address never shows the old surroundings.
  const [lastLoaded, setLastLoaded] = useState<NearbyPlacesResponse>();
  useEffect(() => {
    if (nearby.data) setLastLoaded(nearby.data);
  }, [nearby.data]);
  const current =
    nearby.data ??
    (lastLoaded &&
    lastLoaded.center.latitude === lat &&
    lastLoaded.center.longitude === lon
      ? lastLoaded
      : undefined);
  const isPrevious = !!current && !nearby.data;

  const loadedPlaces = current?.places;
  const filtered = useMemo(
    () => visiblePlaces(loadedPlaces ?? [], categories, kinds),
    [loadedPlaces, categories, kinds],
  );
  const groups = useMemo(
    () => groupPlaces(filtered, sort, categories),
    [filtered, sort, categories],
  );
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      filtered.map((place) => {
        const category = displayCategory(place, categories);
        return {
          id: place.id,
          latitude: place.latitude,
          longitude: place.longitude,
          color: categoryColors[category],
          icon: category,
        };
      }),
    [filtered, categories],
  );
  const selectedPlace = filtered.find((place) => place.id === selected);

  // A selection closes when filters, radius or address hide the place; it survives everything else.
  useEffect(() => {
    if (selected && !selectedPlace) setSelected(undefined);
  }, [selected, selectedPlace]);

  const update = useCallback(
    (change: (next: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(params);
      change(next);
      setParams(next, { replace });
    },
    [params, setParams],
  );

  /** Switches to a confirmed address; radius and filters are kept. */
  const choose = useCallback(
    (next: ResolvedAddress, replace = false) =>
      update((p) => {
        for (const key of ADDRESS_KEYS) p.delete(key);
        addressParams(next).forEach((value, key) => p.set(key, value));
      }, replace),
    [update],
  );

  // A link with only free text (?address=…) is resolved explicitly. Just one confident match is
  // used without asking; otherwise the candidates are offered and nothing is picked arbitrarily.
  const freeText = address ? "" : (params.get("address")?.trim() ?? "");
  const resolve = useQuery({
    queryKey: ["location-address", freeText, false],
    queryFn: ({ signal }) => addressSearch(freeText, false, signal),
    enabled: freeText.length >= 3,
    staleTime: 300000,
    retry: false,
  });
  const uniqueMatch =
    resolve.data?.resolution === "unique"
      ? resolve.data.suggestions[0]
      : undefined;
  useEffect(() => {
    // Replace the history entry, otherwise "back" would resolve and jump forward again.
    if (uniqueMatch && freeText) choose(uniqueMatch, true);
  }, [uniqueMatch, freeText, choose]);

  function select(id: string, from: "map" | "list") {
    if (from === "list") {
      focusDetails.current = true;
      if (mapAvailable) setView("map");
    }
    setSelected(id);
  }
  // Keyboard and screen reader users land on the details after choosing from the list.
  useEffect(() => {
    if (selectedPlace && focusDetails.current) {
      focusDetails.current = false;
      details.current?.focus({ preventScroll: true });
      details.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [selectedPlace]);
  function closeDetails() {
    const id = selected;
    setSelected(undefined);
    if (id) document.getElementById(placeItemId(id))?.focus();
  }

  const error = nearby.isError ? locationErrorText(nearby.error, "places") : null;
  const failedCategories =
    current?.issues.filter((issue) => issue.reason !== "limit") ?? [];
  const filtersActive =
    categories.length !== ALL_CATEGORIES.length || kinds.length > 0;
  const resolveError = resolve.isError
    ? locationErrorText(resolve.error, "address")
    : null;

  const emptyList = !current ? (
    <p className="state-message" role={error ? undefined : "status"}>
      {error
        ? "Es liegen keine Umgebungsdaten vor."
        : "Orte werden geladen …"}
    </p>
  ) : !current.places.length ? (
    <p className="state-message">
      Im Umkreis von {formatRadius(current.radius)} wurden keine Orte erfasst.
      {current.incomplete.length > 0 &&
        " Mindestens eine Kategorie konnte nicht geladen werden."}
    </p>
  ) : !filtered.length ? (
    <div className="state-message">
      <p>Kein erfasster Ort entspricht den gewählten Filtern.</p>
      <Button
        variant="outline"
        onClick={() =>
          update((p) => {
            p.delete("categories");
            p.delete("kinds");
          })
        }
      >
        Filter zurücksetzen
      </Button>
    </div>
  ) : undefined;

  return (
    <div className="container location-explorer">
      <header className="location-heading">
        <p className="portal-kicker">WOHNCHECK · UMGEBUNG</p>
        <h1>Deine Adresse. Dein Umfeld.</h1>
        <p>Entdecke, was rund um dein Zuhause liegt.</p>
      </header>
      <AddressSearch
        initial={address?.label ?? freeText}
        onSelect={(next) => choose(next)}
      />

      {!address && (
        <div className="location-intro" aria-live="polite">
          {!freeText ? (
            <p className="state-message">
              Gib eine Adresse ein und wähle einen Treffer. Die Analyse
              verwendet ausschließlich echte Ortsdaten aus OpenStreetMap.
            </p>
          ) : freeText.length < 3 ? (
            <p className="state-message">
              Bitte gib mindestens drei Zeichen ein.
            </p>
          ) : resolve.isPending ? (
            <p className="state-message" role="status">
              Adresse wird aufgelöst …
            </p>
          ) : resolveError ? (
            <div className="location-status" role="alert">
              <p>
                <strong>{resolveError.title}.</strong> {resolveError.text}
              </p>
              {resolveError.retry && (
                <Button variant="outline" onClick={() => resolve.refetch()}>
                  Erneut versuchen
                </Button>
              )}
            </div>
          ) : resolve.data?.suggestions.length ? (
            !uniqueMatch && (
              <section
                className="location-candidates"
                aria-labelledby="location-candidates-title"
              >
                <h2 id="location-candidates-title">
                  „{freeText}“ ist nicht eindeutig. Welche Adresse meinst du?
                </h2>
                <ul>
                  {resolve.data.suggestions.map((candidate) => (
                    <li key={candidate.id}>
                      <button type="button" onClick={() => choose(candidate)}>
                        <strong>{candidate.label}</strong>
                        <small>{accuracyLabel(candidate)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          ) : (
            <p className="state-message" role="alert">
              „{freeText}“ konnte nicht als Adresse in Deutschland gefunden
              werden. Bitte prüfe Straße, Hausnummer, PLZ und Ort.
            </p>
          )}
        </div>
      )}

      {address && (
        <>
          <div className="location-toolbar">
            <div>
              <h2>{address.label}</h2>
              {address.accuracy !== "building" && (
                <p className="location-accuracy">
                  <strong>Keine bestätigte Hausnummer.</strong> Mittelpunkt ist
                  die gefundene{" "}
                  {address.accuracy === "street"
                    ? "Straße"
                    : "Gebietsposition"}
                  ; Entfernungen beziehen sich darauf.
                </p>
              )}
            </div>
            <RadiusSelect
              value={radius}
              onChange={(next) =>
                update((p) =>
                  next === DEFAULT_RADIUS
                    ? p.delete("radius")
                    : p.set("radius", String(next)),
                )
              }
            />
          </div>
          <LandlordAtAddress
            address={{
              street: address.street,
              houseNumber: address.accuracy === "building" ? address.houseNumber : undefined,
              postalCode: address.postalCode,
              city: address.city,
            }}
          />
          <CategoryFilters
            categories={categories}
            kinds={kinds}
            places={current?.places ?? []}
            onChange={(nextCategories: PlaceCategory[], nextKinds: PlaceKind[]) =>
              update((p) => {
                if (nextCategories.length === ALL_CATEGORIES.length)
                  p.delete("categories");
                else p.set("categories", nextCategories.join(","));
                if (nextKinds.length) p.set("kinds", nextKinds.join(","));
                else p.delete("kinds");
              })
            }
          />

          {nearby.isFetching && (
            <p role="status" className="location-status">
              Umgebung im Umkreis von {formatRadius(radius)} wird geladen … Das
              kann einige Sekunden dauern.
              {isPrevious &&
                ` Bis dahin siehst du den vorherigen Stand (${formatRadius(current.radius)}).`}
            </p>
          )}
          {error && !nearby.isFetching && (
            <div role="alert" className="location-status location-status-error">
              <p>
                <strong>{error.title}.</strong> {error.text}
                {isPrevious &&
                  ` Angezeigt wird weiter der vorherige Stand (${formatRadius(current.radius)}).`}
              </p>
              {error.retry && (
                <Button variant="outline" onClick={() => nearby.refetch()}>
                  Erneut versuchen
                </Button>
              )}
            </div>
          )}

          {current && (
            <div
              className={isPrevious ? "location-previous" : undefined}
              aria-busy={nearby.isFetching}
            >
              {isPrevious && (
                <p className="location-previous-label">
                  Vorheriger Stand · Radius {formatRadius(current.radius)}
                </p>
              )}
              <LocationSummary data={current} />
              {current.stale && (
                <div className="location-status" role="status">
                  <p>
                    <strong>Zwischengespeicherter Stand.</strong> Der
                    Kartendienst ist gerade nicht erreichbar. Du siehst die
                    Daten vom{" "}
                    {new Date(current.fetchedAt).toLocaleString("de-DE")}.
                  </p>
                  <Button variant="outline" onClick={() => nearby.refetch()}>
                    Aktuelle Daten laden
                  </Button>
                </div>
              )}
              {current.issues.length > 0 && (
                <div className="location-status" role="status">
                  <p>
                    <strong>Unvollständige Daten.</strong> Zahlen dieser
                    Kategorien zeigen nur die erfassten Orte:
                  </p>
                  <ul>
                    {current.issues.map((issue) => (
                      <li key={issue.category}>
                        {PLACE_GROUPS[issue.category]}:{" "}
                        {issueText[issue.reason]}
                      </li>
                    ))}
                  </ul>
                  {failedCategories.length > 0 && !isPrevious && (
                    <Button
                      variant="outline"
                      disabled={nearby.isFetching}
                      onClick={() => nearby.refetch()}
                    >
                      Fehlende Kategorien erneut laden
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="sr-only" role="status">
            {current
              ? `${filtered.length} von ${current.places.length} erfassten Orten entsprechen den Filtern.`
              : ""}
          </p>
          {mapAvailable && (
            <div
              className="location-view-switch"
              role="group"
              aria-label="Ansicht"
            >
              <button
                type="button"
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                Karte
              </button>
              <button
                type="button"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                Liste ({filtered.length})
              </button>
            </div>
          )}
          <div
            className={`location-workspace ${mapAvailable ? `view-${view}` : "no-map"}`}
          >
            <div className="location-map-column">
              <Suspense
                fallback={
                  <p role="status" className="state-message">
                    Karte wird geladen …
                  </p>
                }
              >
                <MapRenderer
                  center={{
                    latitude: address.latitude,
                    longitude: address.longitude,
                    label: address.label,
                    radius: current?.radius ?? radius,
                  }}
                  points={mapPoints}
                  selected={selected}
                  onSelect={(id) => select(id, "map")}
                  label="Interaktive Umgebungskarte"
                  consentText="Zum Laden der Karte werden Verbindungen zu OpenFreeMap hergestellt. Die Ortsliste kannst du auch ohne Karte vollständig nutzen."
                  notice={
                    isPrevious
                      ? `Vorheriger Stand · ${formatRadius(current.radius)}`
                      : undefined
                  }
                  onAvailability={setMapAvailable}
                >
                  {selectedPlace && (
                    <PlaceDetails
                      ref={details}
                      place={selectedPlace}
                      onClose={closeDetails}
                    />
                  )}
                </MapRenderer>
              </Suspense>
              <p className="sr-only">
                Alle Orte der Karte stehen auch in der Ergebnisliste und sind
                dort per Tastatur erreichbar.
              </p>
            </div>
            <PlacesPanel
              groups={groups}
              matches={filtered.length}
              loaded={current?.places.length ?? 0}
              active={categories}
              selected={selected}
              sort={sort}
              onSort={setSort}
              onSelect={(id) => select(id, "list")}
              resetKey={`${addressKey}|${radius}|${categoryParam}|${kindParam}`}
              empty={emptyList}
            />
          </div>
          <p className="location-attribution">
            {current && (
              <>
                Stand: {new Date(current.fetchedAt).toLocaleString("de-DE")}
                {filtersActive ? " · Filter aktiv" : ""} ·{" "}
              </>
            )}
            Orte und Adressen:{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              © OpenStreetMap-Mitwirkende
            </a>{" "}
            über{" "}
            <a
              href="https://www.geoapify.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Geoapify
            </a>
            . Karte:{" "}
            <a
              href="https://openfreemap.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenFreeMap
            </a>{" "}
            ©{" "}
            <a
              href="https://www.openmaptiles.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenMapTiles
            </a>
            . Entfernungen sind Luftlinien, keine Geh- oder Fahrzeiten. Die
            Daten können unvollständig sein.
          </p>
        </>
      )}
    </div>
  );
}
