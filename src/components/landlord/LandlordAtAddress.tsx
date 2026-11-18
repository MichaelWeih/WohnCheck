import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupPropertyByAddress } from "@/features/directory/directory-api";
import { PropertyRelations } from "./PropertyRelations";
import { ReportLandlordForm } from "./ReportLandlordForm";

/**
 * Landlord / manager / owner of a checked address. Shows only verified relations; when there is none, it says so
 * plainly and offers to report one — it never infers a landlord from nearby buildings or the area.
 */
export function LandlordAtAddress({
  address,
}: {
  address: { street?: string; houseNumber?: string; postalCode?: string; city?: string };
}) {
  const [reporting, setReporting] = useState(false);
  const enabled = Boolean(address.street);
  const lookup = useQuery({
    queryKey: ["property-lookup", address.street, address.houseNumber, address.postalCode, address.city],
    queryFn: () => lookupPropertyByAddress({ street: address.street!, houseNumber: address.houseNumber, postalCode: address.postalCode, city: address.city }),
    enabled,
    staleTime: 60_000,
  });
  if (!enabled) return null;
  const data = lookup.data;
  const canReport = Boolean(address.street && address.houseNumber && address.postalCode && address.city);

  return (
    <section className="landlord-at-address" aria-labelledby="landlord-at-address-title">
      <h2 id="landlord-at-address-title">
        <Building2 size={18} aria-hidden="true" /> Vermieter und Verwaltung
      </h2>
      {lookup.isLoading ? (
        <p role="status">Zuordnung wird geprüft …</p>
      ) : lookup.isError || !data ? (
        <div role="alert">
          <p>Die Zuordnung konnte gerade nicht geladen werden.</p>
          <Button variant="outline" onClick={() => lookup.refetch()}>Erneut versuchen</Button>
        </div>
      ) : (
        <>
          {data.status === "verified" ? (
            <PropertyRelations parties={data.parties} formerParties={data.formerParties} />
          ) : (
            <>
              <p className="landlord-empty"><strong>{data.message}</strong></p>
              {data.reason === "no_house_number" && <p>{"Wähle eine Adresse mit Hausnummer, um Vermieter zuzuordnen."}</p>}
              {data.formerParties.length > 0 && <PropertyRelations parties={[]} formerParties={data.formerParties} />}
            </>
          )}
          {data.openReports > 0 && (
            <p className="field-hint">
              {data.openReports === 1 ? "Eine ungeprüfte Meldung" : `${data.openReports} ungeprüfte Meldungen`} liegen vor. Sie werden erst nach einer
              Prüfung angezeigt.
            </p>
          )}
          {data.property && (
            <Link to={`/gebaeude/${data.property.id}`} className="text-link">Gebäudeprofil und Erfahrungen ansehen</Link>
          )}
          {canReport &&
            (reporting ? (
              <ReportLandlordForm
                address={{ street: address.street!, houseNumber: address.houseNumber!, postalCode: address.postalCode!, city: address.city! }}
                onDone={() => void lookup.refetch()}
              />
            ) : (
              <Button variant="outline" onClick={() => setReporting(true)}>
                {data.status === "verified" ? "Änderung melden" : "Vermieter melden"}
              </Button>
            ))}
          <details className="lookup-stages">
            <summary>Wie WohnCheck Vermieter zuordnet</summary>
            <ol>
              {data.checkedStages.map((stage) => (
                <li key={stage.stage}>
                  {stage.label}: {stage.result === "match" ? "gefunden" : stage.result === "no_match" ? "kein Treffer" : "derzeit keine zulässige Quelle"}
                </li>
              ))}
            </ol>
            <p>WohnCheck rät keine Vermieter anhand der Nachbarschaft oder ähnlicher Adressen.</p>
          </details>
        </>
      )}
    </section>
  );
}
