import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getPropertyAddressFromApi, getPropertyCoordinates } from "@/data/property-map-data";
import { DetailPageState } from "@/components/DetailPageState";
import { ExperienceSection } from "@/components/ExperienceSection";
import { PropertyMap } from "@/components/PropertyMap";
import { adaptProperty } from "@/features/directory/directory-adapter";
import { fetchProperty } from "@/features/directory/directory-api";
import { retryUnlessNotFound } from "@/lib/api";
export default function PropertyDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["property", id], queryFn: () => fetchProperty(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const property = query.data;
  if (!property) return <DetailPageState isLoading={query.isLoading} error={query.error ?? (!id ? true : null)} notFoundText="Gebäude nicht gefunden." />;
  const coordinates = getPropertyCoordinates(property.id);
  const mappedProperty = coordinates ? { ...adaptProperty(property), ...coordinates } : undefined;
  return <div className="container page-shell"><div className="profile-shell">
    <Link to="/suche" className="text-link"><ArrowLeft size={16} /> Zum Verzeichnis</Link>
    <header className="profile-heading"><h1>{getPropertyAddressFromApi(property)}</h1><p className="profile-meta">Gebäude · {property.postalCode} {property.city}</p></header>
    <div className="profile-layout"><div><ExperienceSection targetType="property" targetId={property.id} />{mappedProperty && <details className="map-disclosure"><summary>Lage auf der Karte</summary><PropertyMap properties={[mappedProperty]} selectedPropertyId={mappedProperty.id} heightClassName="h-[320px]" /></details>}</div><aside className="profile-aside">
      <section><h2>Vermieter und Umgebung</h2>{property.landlord ? <Link to={`/vermieter/${property.landlord.id}`} className="text-link">{property.landlord.name}</Link> : <p>Vermieter nicht verfügbar.</p>}{property.neighborhood && <Link to={`/nachbarschaft/${property.neighborhood.id}`} className="text-link block">{property.neighborhood.districtName}</Link>}</section>
      {!!property.parties?.length && <section><h2>Zuständige Unternehmen</h2>{property.parties.map(party => <div key={`${party.role}-${party.landlord.id}`}><p>{party.roleLabel}</p><Link to={`/vermieter/${party.landlord.id}`} className="text-link">{party.landlord.name}</Link></div>)}</section>}
      <p>Alle Bewertungen beziehen sich auf dieses Gebäude und stammen von WohnCheck-Nutzern.</p>
    </aside></div>
  </div></div>;
}
