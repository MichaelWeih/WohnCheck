import { Link } from "react-router-dom";
import type { PropertyRelationView } from "@/features/api-types";

const dateFormat = new Intl.DateTimeFormat("de-DE", { month: "2-digit", year: "numeric" });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : null);

function period(relation: PropertyRelationView): string | null {
  const from = formatDate(relation.validFrom);
  const to = formatDate(relation.validTo);
  if (from && to) return `${from} – ${to}`;
  if (to) return `bis ${to}`;
  if (from) return `seit ${from}`;
  return null;
}

/**
 * Organisations of a building, one row per role. Each role is labelled separately, so a property manager is never
 * presented as owner or landlord. Former relations are listed apart and marked as such.
 */
export function PropertyRelations({ parties, formerParties }: { parties: PropertyRelationView[]; formerParties: PropertyRelationView[] }) {
  return (
    <>
      {parties.length > 0 && (
        <dl className="relation-list">
          {parties.map((party) => (
            <div key={`${party.role}-${party.landlord.id}-${party.unitLabel ?? ""}`}>
              <dt>
                {party.roleLabel}
                {party.unitLabel && <span className="relation-unit"> · nur {party.unitLabel}</span>}
              </dt>
              <dd>
                <Link to={`/vermieter/${party.landlord.id}`} className="text-link">{party.landlord.name}</Link>
                <span className="relation-meta">
                  {[party.statusLabel, period(party)].filter(Boolean).join(" · ")}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {formerParties.length > 0 && (
        <details className="relation-former">
          <summary>Früher zuständig ({formerParties.length})</summary>
          <dl className="relation-list">
            {formerParties.map((party) => (
              <div key={`former-${party.role}-${party.landlord.id}-${party.validTo ?? ""}`}>
                <dt>{party.roleLabel}</dt>
                <dd>
                  <Link to={`/vermieter/${party.landlord.id}`} className="text-link">{party.landlord.name}</Link>
                  <span className="relation-meta">{period(party) ?? "nicht mehr aktuell"}</span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}
