import { useState } from "react";
import { PropertySourcePanels } from "@/components/PropertySourcePanels";
import { PublicScoreCard } from "@/components/PublicScoreCard";
import { fetchScore } from "@/features/scores/score-api";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getPropertyCoordinates } from "@/data/property-map-data";
import { DetailPageState } from "@/components/DetailPageState";
import { ExperienceSection } from "@/components/ExperienceSection";
import { ObjectMap } from "@/components/ObjectMap";
import { Button } from "@/components/ui/button";
import { PropertyRelations } from "@/components/landlord/PropertyRelations";
import { ReportLandlordForm } from "@/components/landlord/ReportLandlordForm";
import { fetchProperty } from "@/features/directory/directory-api";
import { addressQueryUrl } from "@/features/location/api";
import { retryUnlessNotFound } from "@/lib/api";

export default function PropertyDetailPage() {
  const { id } = useParams();
  const [reporting, setReporting] = useState(false);
  const query = useQuery({ queryKey: ["property", id], queryFn: () => fetchProperty(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const property = query.data;
  const score = useQuery({ queryKey: ["score", "property", id], queryFn: () => fetchScore("property", id!), enabled: Boolean(property), retry: 1 });
  if (!property) return <DetailPageState isLoading={query.isLoading} error={query.error ?? (!id ? true : null)} notFoundText="Gebäude nicht gefunden." />;
  const coordinates = getPropertyCoordinates(property.id);
  const address = `${property.street} ${property.houseNumber}`;
  const mappedProperty = coordinates
    ? {
        id: property.id, street: property.street, house_number: property.houseNumber, postal_code: property.postalCode, city: property.city,
        landlord_id: property.landlord?.id ?? "", landlord_name: property.landlord?.name ?? "", rating_overall: property.ratingOverall ?? 0,
        review_count: property.reviewCount, ratings: {}, ...coordinates,
      }
    : undefined;
  const known = property.parties.length > 0;

  return <div className="container page-shell"><div className="profile-shell">
    <Link to="/suche" className="text-link"><ArrowLeft size={16} /> Zum Verzeichnis</Link>
    <header className="profile-heading"><h1>{address}</h1><p className="profile-meta">Gebäude · {property.postalCode} {property.city}</p></header>
    <PublicScoreCard score={score.data} /><PropertySourcePanels property={property} />
    <div className="profile-layout"><div><ExperienceSection targetType="property" targetId={property.id} />{mappedProperty && <details className="map-disclosure"><summary>Lage auf der Karte</summary><ObjectMap properties={[mappedProperty]} selectedPropertyId={mappedProperty.id} linkToDetails={false} /></details>}</div><aside className="profile-aside">
      <section>
        <h2>Vermieter und Verwaltung</h2>
        {known ? <PropertyRelations parties={property.parties} formerParties={property.formerParties} /> : <>
          <p><strong>Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.</strong></p>
          {property.formerParties.length > 0 && <PropertyRelations parties={[]} formerParties={property.formerParties} />}
        </>}
        {property.openReports > 0 && <p className="field-hint">{property.openReports === 1 ? "Eine ungeprüfte Meldung liegt" : `${property.openReports} ungeprüfte Meldungen liegen`} vor.</p>}
        {reporting
          ? <ReportLandlordForm address={{ street: property.street, houseNumber: property.houseNumber, postalCode: property.postalCode, city: property.city }} onDone={() => void query.refetch()} />
          : <Button variant="outline" onClick={() => setReporting(true)}>{known ? "Änderung melden" : "Vermieter melden"}</Button>}
        <p className="field-hint">Zuordnungen gelten für das Gebäude. Einzelne Wohnungen können andere Vermieter haben.</p>
      </section>
      <section>
        <h2>Umgebung</h2>
        {property.neighborhood && <Link to={`/nachbarschaft/${property.neighborhood.id}`} className="text-link block">{property.neighborhood.districtName}</Link>}
        <Link to={addressQueryUrl(`${address}, ${property.postalCode} ${property.city}`)} className="text-link block">Umgebung dieser Adresse prüfen</Link>
      </section>
      <p>Alle Bewertungen beziehen sich auf dieses Gebäude und stammen von WohnCheck-Nutzern.</p>
    </aside></div>
  </div></div>;
}
