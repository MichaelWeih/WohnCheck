import { PLACE_GROUPS, PLACE_KINDS, Place, PlaceCategory, PlaceKind } from "./types";
import { ALL_CATEGORIES, categoryColors, kindsOf } from "./utils";

/**
 * View filters. They never trigger a request: categories and subcategories only narrow down the
 * places that are already loaded. Subcategories apply inside their own category.
 */
export function CategoryFilters({
  categories,
  kinds,
  places,
  onChange,
}: {
  categories: PlaceCategory[];
  kinds: PlaceKind[];
  /** All loaded places, used for the counts next to the subcategories. */
  places: Place[];
  onChange: (categories: PlaceCategory[], kinds: PlaceKind[]) => void;
}) {
  const allActive = categories.length === ALL_CATEGORIES.length;
  const count = (kind: PlaceKind) =>
    places.filter((place) => place.kinds.includes(kind)).length;
  /** Subcategories of categories that were switched off are dropped with them. */
  const setCategories = (next: PlaceCategory[]) =>
    onChange(
      ALL_CATEGORIES.filter((category) => next.includes(category)),
      kinds.filter((kind) =>
        next.some((category) => kindsOf(category).includes(kind)),
      ),
    );
  const toggleKind = (kind: PlaceKind) =>
    onChange(
      categories,
      kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind],
    );

  return (
    <div className="location-filters">
      <div
        className="location-category-buttons"
        role="group"
        aria-label="Kategorien ein- und ausblenden"
      >
        <button
          type="button"
          aria-pressed={allActive && kinds.length === 0}
          onClick={() => onChange(ALL_CATEGORIES, [])}
        >
          Alle
        </button>
        {ALL_CATEGORIES.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={categories.includes(category)}
            onClick={() =>
              setCategories(
                categories.includes(category)
                  ? categories.filter((c) => c !== category)
                  : [...categories, category],
              )
            }
          >
            <span
              className="location-dot"
              style={{ background: categoryColors[category] }}
              aria-hidden="true"
            />
            {PLACE_GROUPS[category]}
          </button>
        ))}
      </div>
      <details className="location-subfilter-panel">
        <summary>
          Unterkategorien{kinds.length ? ` (${kinds.length} aktiv)` : ""}
        </summary>
        {categories.length === 0 ? (
          <p>Aktiviere eine Kategorie, um ihre Unterkategorien zu sehen.</p>
        ) : (
          <>
            <p>
              Ohne Auswahl werden alle Unterkategorien einer Kategorie gezeigt.
              {kinds.length > 0 && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onChange(categories, [])}
                  >
                    Auswahl aufheben
                  </button>
                </>
              )}
            </p>
            {categories.map((category) => (
              <fieldset key={category}>
                <legend>{PLACE_GROUPS[category]}</legend>
                <div className="location-subfilters">
                  {kindsOf(category).map((kind) => (
                    <label key={kind}>
                      <input
                        type="checkbox"
                        checked={kinds.includes(kind)}
                        onChange={() => toggleKind(kind)}
                      />
                      <span>
                        {PLACE_KINDS[kind][1]}
                        <small> ({count(kind)})</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </>
        )}
      </details>
    </div>
  );
}
