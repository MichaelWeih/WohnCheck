import { NearbyPlacesResponse, PLACE_GROUPS } from "./types";
import {
  ALL_CATEGORIES,
  categoryColors,
  formatDistance,
  formatMetric,
  formatRadius,
} from "./utils";

/**
 * Key figures per category, always computed from everything that was loaded for the address,
 * independent of the view filters. Incomplete figures are labelled instead of looking exact.
 */
export function LocationSummary({ data }: { data: NearbyPlacesResponse }) {
  return (
    <section className="location-summary" aria-labelledby="location-summary-title">
      <h2 id="location-summary-title" className="sr-only">
        Übersicht aller erfassten Orte im Umkreis von {formatRadius(data.radius)}
      </h2>
      {ALL_CATEGORIES.map((category) => {
        const metric = data.metrics[category];
        return (
          <div key={category} data-category={category} data-status={metric.status}>
            <h3>
              <span
                className="location-dot"
                style={{ background: categoryColors[category] }}
                aria-hidden="true"
              />
              {PLACE_GROUPS[category]}
            </h3>
            {metric.status === "unavailable" ? (
              <>
                <strong aria-hidden="true">–</strong>
                <p>Daten nicht verfügbar</p>
              </>
            ) : (
              <>
                <strong>
                  {metric.total}
                  {metric.status === "truncated" ? "+" : ""}
                </strong>
                <p>
                  {metric.status === "truncated"
                    ? "erfasste Orte (Limit erreicht)"
                    : `${metric.total === 1 ? "Ort" : "Orte"} in ${formatRadius(data.radius)}`}
                </p>
                <dl>
                  <div>
                    <dt>Nächster Ort</dt>
                    <dd>
                      {metric.nearestDistance !== null
                        ? `${formatDistance(metric.nearestDistance)} Luftlinie`
                        : "keiner erfasst"}
                    </dd>
                  </div>
                  <div>
                    <dt>bis 500 m</dt>
                    <dd>
                      {formatMetric(metric.count500m, metric.count500mStatus)}
                    </dd>
                  </div>
                  <div>
                    <dt>bis 1 km</dt>
                    <dd>
                      {formatMetric(metric.count1000m, metric.count1000mStatus)}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
