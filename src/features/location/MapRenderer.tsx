import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { ReactNode, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { GeoJSONSource, Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point, Polygon } from "geojson";
import { useConsent } from "@/components/consent/ConsentProvider";
import { Button } from "@/components/ui/button";
import "./map.css";

maplibregl.setWorkerUrl(workerUrl);

export const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export type MapIcon =
  | "transit"
  | "shopping"
  | "health"
  | "education"
  | "leisure"
  | "food"
  | "infrastructure";

/** A place rendered in the clustered GeoJSON layer (hundreds are fine). */
export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  icon: MapIcon;
}

/** An object of the directory (building, neighbourhood). Rendered as a focusable marker, never clustered. */
export interface MapObject {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  kind: "property" | "area";
  outline?: Array<{ latitude: number; longitude: number }>;
}

/** The checked address: its own marker, optionally with the search radius drawn around it. */
export interface MapCenter {
  latitude: number;
  longitude: number;
  label: string;
  radius?: number;
}

type Status = "loading" | "ready" | "failed";
type Problem = "webgl" | "load";

const CLUSTER_MAX_ZOOM = 16;
/** A style that reports an error and still has not loaded after this time counts as failed. */
const ERROR_GRACE_MS = 6000;
const LOAD_TIMEOUT_MS = 25000;
const GERMANY: [number, number] = [10.45, 51.16];

const iconPaths: Record<MapIcon, string> = {
  transit: "M6 3h12v14H6z M8 7h8 M8 11h8 M8 20v-3 M16 20v-3",
  shopping: "M3 3h2l3 12h10l3-9H6 M9 20h.01 M17 20h.01",
  health: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  education: "M3 10l9-7 9 7v11H3z M9 21v-7h6v7 M8 10h.01 M16 10h.01",
  leisure: "M12 2l7 9h-3l5 6H3l5-6H5z M12 17v5",
  food: "M5 2v8 M9 2v8 M5 6h4 M7 10v12 M17 2v20 M17 2c-6 6-4 10 0 10",
  infrastructure: "M4 21V5h16v16 M8 9h2 M14 9h2 M8 13h2 M14 13h2 M10 21v-4h4v4",
};

const locale = {
  "NavigationControl.ZoomIn": "Karte vergrößern",
  "NavigationControl.ZoomOut": "Karte verkleinern",
  "AttributionControl.ToggleAttribution": "Quellenangaben ein- oder ausblenden",
  "AttributionControl.MapFeedback": "Kartenfehler melden",
  "CooperativeGesturesHandler.WindowsHelpText":
    "Strg + Scrollen zoomt die Karte",
  "CooperativeGesturesHandler.MacHelpText": "⌘ + Scrollen zoomt die Karte",
  "CooperativeGesturesHandler.MobileHelpText":
    "Karte mit zwei Fingern verschieben",
};

function webglSupported() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = (ms: number) => (reducedMotion() ? 0 : ms);

function addIcons(m: LibreMap) {
  for (const [key, path] of Object.entries(iconPaths)) {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.scale(2, 2);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.8;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke(new Path2D(path));
    m.addImage(
      key,
      {
        width: 48,
        height: 48,
        data: new Uint8Array(context.getImageData(0, 0, 48, 48).data),
      },
      { pixelRatio: 2 },
    );
  }
}

const metresToLat = (metres: number) => metres / 111320;
const metresToLon = (metres: number, latitude: number) =>
  metres / (111320 * Math.cos((latitude * Math.PI) / 180));

function circle(center?: MapCenter): FeatureCollection<Polygon> {
  if (!center?.radius) return { type: "FeatureCollection", features: [] };
  const coords = Array.from({ length: 65 }, (_, i) => {
    const t = (i / 64) * 2 * Math.PI;
    return [
      center.longitude +
        Math.cos(t) * metresToLon(center.radius!, center.latitude),
      center.latitude + Math.sin(t) * metresToLat(center.radius!),
    ];
  });
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      },
    ],
  };
}

function outlines(objects: MapObject[]): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: objects
      .filter((object) => (object.outline?.length ?? 0) >= 3)
      .map((object) => {
        const ring = object.outline!.map((p) => [p.longitude, p.latitude]);
        return {
          type: "Feature" as const,
          properties: { id: object.id },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[...ring, ring[0]]],
          },
        };
      }),
  };
}

function pointData(points: MapPoint[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      properties: { id: p.id, color: p.color, icon: p.icon },
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
    })),
  };
}

function fit(m: LibreMap, center: MapCenter | undefined, objects: MapObject[]) {
  if (center) {
    const radius = center.radius ?? 500;
    const lat = metresToLat(radius);
    const lon = metresToLon(radius, center.latitude);
    m.fitBounds(
      [
        [center.longitude - lon, center.latitude - lat],
        [center.longitude + lon, center.latitude + lat],
      ],
      { padding: 40, duration: 0 },
    );
    return;
  }
  const positions = objects.flatMap((object) => [
    object,
    ...(object.outline ?? []),
  ]);
  if (!positions.length) return;
  if (positions.length === 1) {
    m.jumpTo({
      center: [positions[0].longitude, positions[0].latitude],
      zoom: 15,
    });
    return;
  }
  const lons = positions.map((p) => p.longitude);
  const lats = positions.map((p) => p.latitude);
  m.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: 56, duration: 0, maxZoom: 15 },
  );
}

/**
 * The one MapLibre renderer of the app. It only draws what it is given and reports clicks:
 * the address check passes the address, radius and filtered places, the directory views pass
 * their object markers. Panning and zooming never change the data or the search centre.
 *
 * External map resources are loaded only after consent. Without WebGL, or when the style cannot be
 * loaded, a text fallback is shown and `onAvailability(false)` lets the caller keep its list usable.
 */
export function MapRenderer({
  center,
  points = [],
  objects = [],
  selected,
  onSelect,
  label,
  consentText,
  notice,
  onAvailability,
  className = "",
  children,
}: {
  center?: MapCenter;
  points?: MapPoint[];
  objects?: MapObject[];
  selected?: string;
  onSelect?: (id: string) => void;
  /** Accessible name of the map. */
  label: string;
  consentText: string;
  /** Badge shown on the map, e.g. while the visible places belong to the previous query. */
  notice?: string;
  onAvailability?: (available: boolean) => void;
  className?: string;
  /** Rendered on top of the map (below it when no map is shown), e.g. details of the selection. */
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap>();
  const centerMarker = useRef<maplibregl.Marker>();
  const objectMarkers = useRef(new Map<string, maplibregl.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const availability = useRef(onAvailability);
  availability.current = onAvailability;
  /** A selection made on the map must not move the camera; one made in the list should. */
  const pickedOnMap = useRef(false);
  const latest = useRef({ center, objects });
  latest.current = { center, objects };

  const [status, setStatus] = useState<Status>("loading");
  const [problem, setProblem] = useState<Problem>("load");
  const [tileIssue, setTileIssue] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { canLoadExternalMedia, acceptAll } = useConsent();

  useEffect(() => {
    if (!canLoadExternalMedia || !host.current) return;
    setTileIssue(false);
    if (!webglSupported()) {
      setProblem("webgl");
      setStatus("failed");
      availability.current?.(false);
      return;
    }
    setStatus("loading");
    let m: LibreMap;
    let loaded = false;
    let disposed = false;
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    const fail = (reason: Problem) => {
      if (disposed || loaded) return;
      setProblem(reason);
      setStatus("failed");
      availability.current?.(false);
    };
    const loadTimer = setTimeout(() => fail("load"), LOAD_TIMEOUT_MS);
    const start = latest.current;
    try {
      m = new maplibregl.Map({
        container: host.current,
        style: import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE,
        center: start.center
          ? [start.center.longitude, start.center.latitude]
          : start.objects[0]
            ? [start.objects[0].longitude, start.objects[0].latitude]
            : GERMANY,
        zoom: start.center || start.objects.length ? 14 : 5,
        attributionControl: { compact: true },
        locale,
        // On touch screens one finger keeps scrolling the page; the map is moved with two.
        cooperativeGestures: matchMedia("(pointer: coarse)").matches,
      });
    } catch {
      clearTimeout(loadTimer);
      fail("webgl");
      return;
    }
    map.current = m;
    if (import.meta.env.DEV)
      (window as unknown as { __wohncheckMap?: LibreMap }).__wohncheckMap = m;
    m.getCanvas().setAttribute("aria-label", label);
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    m.on("load", () => {
      loaded = true;
      clearTimeout(loadTimer);
      clearTimeout(errorTimer);
      addIcons(m);
      m.addSource("areas", { type: "geojson", data: outlines([]) });
      m.addSource("radius", { type: "geojson", data: circle() });
      m.addSource("places", {
        type: "geojson",
        data: pointData([]),
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
      });
      m.addLayer({
        id: "areas-fill",
        type: "fill",
        source: "areas",
        paint: { "fill-color": "#28704d", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: "areas-line",
        type: "line",
        source: "areas",
        paint: { "line-color": "#28704d", "line-width": 1.5 },
      });
      m.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": "#2455a4", "fill-opacity": 0.04 },
      });
      m.addLayer({
        id: "radius-line",
        type: "line",
        source: "radius",
        paint: {
          "line-color": "#2455a4",
          "line-width": 1.5,
          "line-dasharray": [3, 3],
        },
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#233e65",
          "circle-radius": 22,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });
      m.addLayer({
        id: "poi",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 16,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      m.addLayer({
        id: "poi-symbol",
        type: "symbol",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": 0.8,
          "icon-allow-overlap": true,
        },
      });
      m.addLayer({
        id: "poi-selected",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-color": "#ffffff",
          "circle-opacity": 0,
          "circle-radius": 21,
          "circle-stroke-color": "#182a43",
          "circle-stroke-width": 3,
        },
      });
      // A cluster opens by zooming to the level at which it splits.
      m.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const zoom = await (
          m.getSource("places") as GeoJSONSource
        ).getClusterExpansionZoom(Number(f.properties?.cluster_id));
        m.easeTo({
          center: f.geometry.coordinates as [number, number],
          zoom,
          duration: motion(250),
        });
      });
      m.on("click", "poi", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (!id) return;
        pickedOnMap.current = true;
        select.current?.(String(id));
      });
      for (const layer of ["poi", "clusters"]) {
        m.on("mouseenter", layer, () => {
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", layer, () => {
          m.getCanvas().style.cursor = "";
        });
      }
      setStatus("ready");
      availability.current?.(true);
    });
    m.on("error", () => {
      if (loaded) {
        setTileIssue(true);
        return;
      }
      errorTimer ??= setTimeout(() => fail("load"), ERROR_GRACE_MS);
    });
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(host.current);
    const markers = objectMarkers.current;
    return () => {
      disposed = true;
      clearTimeout(loadTimer);
      clearTimeout(errorTimer);
      observer.disconnect();
      centerMarker.current?.remove();
      centerMarker.current = undefined;
      markers.forEach((marker) => marker.remove());
      markers.clear();
      m.remove();
      map.current = undefined;
      setStatus("loading");
    };
    // One map instance per consent/retry; address, radius and data are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadExternalMedia, attempt]);

  const ready = status === "ready";
  const centerLat = center?.latitude;
  const centerLon = center?.longitude;
  const centerRadius = center?.radius;
  const centerLabel = center?.label;

  // Address marker, radius circle and the camera follow the address and radius only.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const current = latest.current.center;
    (m.getSource("radius") as GeoJSONSource).setData(circle(current));
    if (!current) {
      centerMarker.current?.remove();
      centerMarker.current = undefined;
      return;
    }
    if (!centerMarker.current) {
      const el = document.createElement("div");
      el.className = "wc-map-address";
      el.setAttribute("role", "img");
      el.textContent = "⌂";
      centerMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([current.longitude, current.latitude])
        .addTo(m);
    }
    centerMarker.current.setLngLat([current.longitude, current.latitude]);
    centerMarker.current
      .getElement()
      .setAttribute("aria-label", `Geprüfte Adresse: ${current.label}`);
    fit(m, current, []);
  }, [ready, centerLat, centerLon, centerRadius, centerLabel]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("places") as GeoJSONSource).setData(pointData(points));
  }, [ready, points]);

  // Directory objects are real buttons: reachable by keyboard and announced with their name.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const markers = objectMarkers.current;
    markers.forEach((marker) => marker.remove());
    markers.clear();
    (m.getSource("areas") as GeoJSONSource).setData(outlines(objects));
    for (const object of objects) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `wc-map-object wc-map-object-${object.kind}`;
      el.setAttribute("aria-label", object.label);
      el.title = object.label;
      el.textContent = object.kind === "property" ? "⌂" : "◎";
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        pickedOnMap.current = true;
        select.current?.(object.id);
      });
      markers.set(
        object.id,
        new maplibregl.Marker({ element: el })
          .setLngLat([object.longitude, object.latitude])
          .addTo(m),
      );
    }
    if (!latest.current.center) fit(m, undefined, objects);
  }, [ready, objects]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setFilter("poi-selected", ["==", ["get", "id"], selected ?? ""]);
    objectMarkers.current.forEach((marker, id) => {
      marker.getElement().setAttribute("aria-pressed", String(id === selected));
    });
    const fromMap = pickedOnMap.current;
    pickedOnMap.current = false;
    if (!selected || fromMap) return;
    const target =
      points.find((p) => p.id === selected) ??
      objects.find((o) => o.id === selected);
    if (!target) return;
    const isPoint = points.some((p) => p.id === selected);
    m.easeTo({
      center: [target.longitude, target.latitude],
      // Details are laid over the lower part of the map: keep the marker in the free upper part.
      offset: children ? [0, -m.getContainer().clientHeight * 0.22] : [0, 0],
      // Above the clustering limit, so a place chosen in the list is shown as its own marker.
      zoom: isPoint
        ? Math.max(CLUSTER_MAX_ZOOM + 1, m.getZoom())
        : Math.max(14, m.getZoom()),
      duration: motion(300),
    });
    // Only a new selection moves the camera, not every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected]);

  if (!canLoadExternalMedia)
    return (
      <div className={`wc-map-wrap ${className}`}>
        <div className="wc-map-placeholder">
          <h2>{label}</h2>
          <p>{consentText}</p>
          <Button onClick={acceptAll}>Karte aktivieren</Button>
        </div>
        {children}
      </div>
    );

  if (status === "failed")
    return (
      <div className={`wc-map-wrap ${className}`}>
        <div className="wc-map-placeholder" role="alert">
          <h2>Karte nicht verfügbar</h2>
          <p>
            {problem === "webgl"
              ? "Dieser Browser stellt kein WebGL bereit, das die Karte benötigt. Alle Orte findest du vollständig in der Liste."
              : "Die Karte konnte nicht geladen werden. Alle Orte findest du vollständig in der Liste."}
          </p>
          {problem === "load" && (
            <Button
              variant="outline"
              onClick={() => {
                // Render the map container again first; the effect then starts a fresh instance.
                setStatus("loading");
                setAttempt((n) => n + 1);
              }}
            >
              Karte erneut laden
            </Button>
          )}
        </div>
        {children}
      </div>
    );

  return (
    <div className={`wc-map-wrap ${className}`}>
      <div className="wc-map-shell" data-map-status={status}>
        <div ref={host} className="wc-map" />
        {status === "loading" && (
          <p className="wc-map-badge" role="status">
            Karte wird geladen …
          </p>
        )}
        {ready && notice && (
          <p className="wc-map-badge" role="status">
            {notice}
          </p>
        )}
        {ready && tileIssue && (
          <p className="wc-map-issue" role="status">
            Einzelne Kartenteile konnten nicht geladen werden. Die Orte und die
            Liste sind davon nicht betroffen.
          </p>
        )}
        {ready && (center || objects.length > 1) && (
          <button
            type="button"
            className="wc-map-recenter"
            onClick={() =>
              map.current && fit(map.current, center, center ? [] : objects)
            }
          >
            {center ? "Zur Adresse" : "Alle anzeigen"}
          </button>
        )}
        {children && <div className="wc-map-overlay">{children}</div>}
      </div>
    </div>
  );
}
