import { PropertySourcePanels } from "@/components/PropertySourcePanels";
import { PublicScoreCard } from "@/components/PublicScoreCard";
import { fetchScore } from "@/features/scores/score-api";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getPropertyAddressFromApi, getPropertyCoordinates } from "@/data/property-map-data";
import { DetailPageState } from "@/components/DetailPageState";
import { ExperienceSection } from "@/components/ExperienceSection";
import { ObjectMap } from "@/components/ObjectMap";
import { adaptProperty } from "@/features/directory/directory-adapter";
import { fetchProperty } from "@/features/directory/directory-api";
import { retryUnlessNotFound } from "@/lib/api";
export default function PropertyDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["property", id], queryFn: () => fetchProperty(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const property = query.data;
  const score = useQuery({ queryKey: ["score", "property", id], queryFn: () => fetchScore("property", id!), enabled: Boolean(property), retry: 1 });
  if (!property) return <DetailPageState isLoading={query.isLoading} error={query.error ?? (!id ? true : null)} notFoundText="Gebäude nicht gefunden." />;
  const coordinates = getPropertyCoordinates(property.id);
  const mappedProperty = coordinates ? { ...adaptProperty(property), ...coordinates } : undefined;
  return <div className="container page-shell"><div className="profile-shell">
    <Link to="/suche" className="text-link"><ArrowLeft size={16} /> Zum Verzeichnis</Link>
    <header className="profile-heading"><h1>{getPropertyAddressFromApi(property)}</h1><p className="profile-meta">Gebäude · {property.postalCode} {property.city}</p></header>
    <PublicScoreCard score={score.data} /><PropertySourcePanels property={property} />
    <div className="profile-layout"><div><ExperienceSection targetType="property" targetId={property.id} />{mappedProperty && <details className="map-disclosure"><summary>Lage auf der Karte</summary><ObjectMap properties={[mappedProperty]} selectedPropertyId={mappedProperty.id} linkToDetails={false} /></details>}</div><aside className="profile-aside">
      <section><h2>Vermieter und Umgebung</h2>{property.landlord ? <Link to={`/vermieter/${property.landlord.id}`} className="text-link">{property.landlord.name}</Link> : <p>Vermieter nicht verfügbar.</p>}{property.neighborhood && <Link to={`/nachbarschaft/${property.neighborhood.id}`} className="text-link block">{property.neighborhood.districtName}</Link>}</section>
      {!!property.parties?.length && <section><h2>Zuständige Unternehmen</h2>{property.parties.map(party => <div key={`${party.role}-${party.landlord.id}`}><p>{party.roleLabel}</p><Link to={`/vermieter/${party.landlord.id}`} className="text-link">{party.landlord.name}</Link></div>)}</section>}
      <p>Alle Bewertungen beziehen sich auf dieses Gebäude und stammen von WohnCheck-Nutzern.</p>
    </aside></div>
  </div></div>;
}
