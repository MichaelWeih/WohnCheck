import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { DetailPageState } from "@/components/DetailPageState";
import { ExperienceSection } from "@/components/ExperienceSection";
import { fetchLandlord } from "@/features/directory/directory-api";
import { retryUnlessNotFound } from "@/lib/api";

export default function LandlordDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["landlord", id], queryFn: () => fetchLandlord(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const landlord = query.data;
  if (!landlord) return <DetailPageState isLoading={query.isLoading} error={query.error ?? (!id ? true : null)} notFoundText="Vermieter nicht gefunden." />;
  return <div className="container page-shell"><div className="profile-shell">
    <Link to="/suche" className="text-link"><ArrowLeft size={16} /> Zum Verzeichnis</Link>
    <header className="profile-heading"><h1>{landlord.name}</h1><p className="profile-meta">{landlord.companyType || "Unternehmensart nicht verfügbar"} · {landlord.city || "Standort nicht verfügbar"}</p></header>
    <div className="profile-layout"><div><ExperienceSection targetType="landlord" targetId={landlord.id} /></div>
      <aside className="profile-aside">
        <section><h2>Über das Unternehmen</h2><p>{landlord.companyType || "Unternehmensart nicht verfügbar"}<br />{landlord.city || "Standort nicht verfügbar"}</p>{landlord.website && <a href={landlord.website} target="_blank" rel="noopener noreferrer" className="text-link">Unternehmenswebsite <ArrowUpRight size={15} /><span className="sr-only"> (neuer Tab)</span></a>}</section>
        <section><h2>Externe Erfahrungen</h2><p>Für dieses Profil sind derzeit keine externen Bewertungen eingebunden. Bewertungen von Trustpilot, Google und Reddit werden nicht zu einer Gesamtbewertung zusammengefasst.</p></section>
        {!!landlord.properties?.length && <section><details><summary>Gebäude ({landlord.properties.length})</summary>{landlord.properties.map(property => <Link key={property.id} to={`/gebaeude/${property.id}`} className="text-link block">{property.street} {property.houseNumber}, {property.city}</Link>)}</details></section>}
        <details><summary>Über die Bewertungen</summary><p>Die Bewertungen stammen von WohnCheck-Nutzern und beschreiben persönliche Erfahrungen. Der angezeigte Durchschnitt bezieht sich ausschließlich auf veröffentlichte WohnCheck-Bewertungen.</p></details>
      </aside>
    </div>
  </div></div>;
}
