import { forwardRef } from "react";
import { X } from "lucide-react";
import { PLACE_GROUPS, Place } from "./types";
import { formatDistance, placeKindLabel } from "./utils";

/**
 * Details of the selected place, the same for a marker and a list entry. Only what the source
 * delivered is shown: no ratings, no walking times, no invented opening hours or lines.
 */
export const PlaceDetails = forwardRef<
  HTMLElement,
  { place: Place; onClose: () => void }
>(function PlaceDetails({ place, onClose }, ref) {
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className="location-place-details"
      aria-labelledby="location-place-title"
    >
      <div className="location-place-heading">
        <h2 id="location-place-title">{place.name}</h2>
        <button type="button" aria-label="Details schließen" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p>
        {placeKindLabel(place)}
        <span className="sr-only">
          {" "}
          · Kategorie{" "}
          {place.categories.map((c) => PLACE_GROUPS[c]).join(", ")}
        </span>
      </p>
      <strong>{formatDistance(place.distanceMeters)} Luftlinie</strong>
      <dl>
        {place.address && (
          <div>
            <dt>Adresse</dt>
            <dd>{place.address}</dd>
          </div>
        )}
        {place.openingHours && (
          <div>
            <dt>Öffnungszeiten laut Quelle</dt>
            <dd>{place.openingHours}</dd>
          </div>
        )}
        {!!place.lines?.length && (
          <div>
            <dt>Linien laut Quelle</dt>
            <dd>{place.lines.join(", ")}</dd>
          </div>
        )}
      </dl>
      <div className="location-place-links">
        {place.website && (
          <a
            href={place.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Website ↗
          </a>
        )}
        {place.sourceUrl && (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Originaleintrag bei OpenStreetMap ↗
          </a>
        )}
      </div>
      <small>Quelle: {place.source}</small>
    </section>
  );
});
