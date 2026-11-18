import { ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PLACE_GROUPS, Place, PlaceCategory } from "./types";
import {
  PlaceGroup,
  PlaceSort,
  categoryColors,
  displayCategory,
  formatDistance,
  placeItemId,
  placeKindLabel,
} from "./utils";

/** Entries rendered per step: for the whole list, and per category when grouped. */
const PAGE_SIZE = 60;
const GROUP_PAGE_SIZE = 20;

/**
 * Result list. It receives exactly the filtered places the map shows. Long lists are rendered in
 * steps, but the headings always state the full number of matches (overall and per category).
 */
export function PlacesPanel({
  groups,
  matches,
  loaded,
  active,
  selected,
  sort,
  onSort,
  onSelect,
  resetKey,
  empty,
}: {
  groups: PlaceGroup[];
  /** Places matching the current filters. */
  matches: number;
  /** All places loaded for the address and radius. */
  loaded: number;
  active: PlaceCategory[];
  selected?: string;
  sort: PlaceSort;
  onSort: (sort: PlaceSort) => void;
  onSelect: (id: string) => void;
  /** Changes whenever address, radius or filters change: the list starts at its first step again. */
  resetKey: string;
  /** Shown instead of the list when there is nothing to list (loading, error, no matches). */
  empty?: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  useEffect(() => setLimits({}), [resetKey, sort]);
  const pageSize = sort === "category" ? GROUP_PAGE_SIZE : PAGE_SIZE;
  const key = (group: PlaceGroup) => group.category ?? "all";
  const limitOf = (group: PlaceGroup) => limits[key(group)] ?? pageSize;

  // A place picked on the map is rendered (if it was beyond the current step) and scrolled into view.
  useEffect(() => {
    if (!selected) return;
    for (const group of groups) {
      const index = group.places.findIndex((place) => place.id === selected);
      if (index < 0) continue;
      const needed = Math.ceil((index + 1) / pageSize) * pageSize;
      if (needed > (limits[key(group)] ?? pageSize)) {
        setLimits((current) => ({ ...current, [key(group)]: needed }));
        return;
      }
    }
    const item = document.getElementById(placeItemId(selected));
    if (item && list.current?.contains(item))
      item.scrollIntoView({ block: "nearest" });
    // Runs for a new selection and once more after the step that contains it was rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, limits]);

  const row = (place: Place) => (
    <li key={place.id}>
      <button
        type="button"
        id={placeItemId(place.id)}
        aria-pressed={selected === place.id}
        onClick={() => onSelect(place.id)}
      >
        <span
          className="location-dot"
          style={{ background: categoryColors[displayCategory(place, active)] }}
          aria-hidden="true"
        />
        <span>
          <strong>{place.name}</strong>
          <small>{placeKindLabel(place)}</small>
          <small>{formatDistance(place.distanceMeters)} Luftlinie</small>
        </span>
      </button>
    </li>
  );

  const more = (group: PlaceGroup) => {
    const shown = Math.min(limitOf(group), group.places.length);
    if (shown >= group.places.length) return null;
    return (
      <div className="location-list-more">
        <p>
          {shown} von {group.places.length}{" "}
          {group.category ? `Orten in ${PLACE_GROUPS[group.category]}` : "Orten"}{" "}
          angezeigt
        </p>
        <Button
          variant="outline"
          onClick={() =>
            setLimits((current) => ({
              ...current,
              [key(group)]: limitOf(group) + pageSize,
            }))
          }
        >
          Weitere Orte anzeigen
          {group.category && (
            <span className="sr-only"> in {PLACE_GROUPS[group.category]}</span>
          )}
        </Button>
      </div>
    );
  };

  return (
    <aside className="location-places-panel" aria-label="Orte in der Umgebung">
      <div className="location-list-heading">
        <div>
          <h2>
            {matches} {matches === 1 ? "Ort" : "Orte"}
          </h2>
          {matches !== loaded && (
            <p>
              Filtertreffer von {loaded} erfassten{" "}
              {loaded === 1 ? "Ort" : "Orten"}
            </p>
          )}
        </div>
        <label>
          <span className="sr-only">Sortierung der Liste</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as PlaceSort)}
          >
            <option value="distance">Nächste zuerst</option>
            <option value="category">Nach Kategorie</option>
          </select>
        </label>
      </div>
      {empty}
      <div ref={list}>
        {groups.map((group) => {
          const places = group.places.slice(0, limitOf(group));
          return group.category ? (
            <section key={group.category} className="location-list-group">
              <h3>
                {PLACE_GROUPS[group.category]}
                <span> · {group.places.length}</span>
              </h3>
              <ul>{places.map(row)}</ul>
              {more(group)}
            </section>
          ) : (
            <div key="all">
              <ul>{places.map(row)}</ul>
              {more(group)}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
