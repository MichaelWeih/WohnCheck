import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { DetailPageState } from "@/components/DetailPageState";
import { ExperienceSection } from "@/components/ExperienceSection";
import { fetchNeighborhood } from "@/features/directory/directory-api";
import { retryUnlessNotFound } from "@/lib/api";
export default function NeighborhoodDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["neighborhood", id], queryFn: () => fetchNeighborhood(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const neighborhood = query.data;
  if (!neighborhood) return <DetailPageState isLoading={query.isLoading} error={query.error ?? (!id ? true : null)} notFoundText="Nachbarschaft nicht gefunden." />;
  return <div className="container page-shell"><div className="profile-shell">
    <Link to="/suche" className="text-link"><ArrowLeft size={16} /> Zum Verzeichnis</Link>
    <header className="profile-heading"><h1>{neighborhood.districtName}</h1><p className="profile-meta">Nachbarschaft · {neighborhood.postalCode} {neighborhood.city}</p></header>
    <div className="profile-layout"><ExperienceSection targetType="neighborhood" targetId={neighborhood.id} /><aside className="profile-aside"><section><h2>Die Nachbarschaft</h2><p>{neighborhood.districtName}<br />{neighborhood.postalCode} {neighborhood.city}</p></section>{!!neighborhood.properties?.length && <section><h2>Gebäude in der Nachbarschaft</h2>{neighborhood.properties.map(property => <Link key={property.id} to={`/gebaeude/${property.id}`} className="text-link block">{property.street} {property.houseNumber}</Link>)}</section>}<p>Alle Bewertungen beziehen sich auf diese Nachbarschaft und stammen von WohnCheck-Nutzern.</p></aside></div>
  </div></div>;
}
