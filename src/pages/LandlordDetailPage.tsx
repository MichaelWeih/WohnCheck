import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, BadgeCheck } from "lucide-react";
import { DetailPageState } from "@/components/DetailPageState";
import { ExperienceSection } from "@/components/ExperienceSection";
import { ExternalExperiences } from "@/components/landlord/ExternalExperiences";
import { ProfileReportForm } from "@/components/landlord/ProfileReportForm";
import { fetchLandlord, fetchLandlordProfile } from "@/features/directory/directory-api";
import { retryUnlessNotFound } from "@/lib/api";

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function LandlordDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["landlord", id], queryFn: () => fetchLandlord(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const profile = useQuery({ queryKey: ["landlord-profile", id], queryFn: () => fetchLandlordProfile(id!), enabled: Boolean(id), retry: retryUnlessNotFound });
  const landlord = query.data;

  // A merged record answers with its successor: show the successor's URL.
  useEffect(() => {
    if (landlord?.redirectedFromId && landlord.id !== id) navigate(`/vermieter/${landlord.id}`, { replace: true });
  }, [landlord, id, navigate]);

  if (!landlord) return <DetailPageState isLoading={query.isLoading} error={query.error ?? (!id ? true : null)} notFoundText="Vermieter nicht gefunden." />;
  const p = profile.data;
  const kind = landlord.kind === "UNKNOWN" ? "Unternehmensart nicht verfügbar" : landlord.kindLabel;
  const properties = landlord.properties ?? [];

  return (
    <div className="container page-shell"><div className="profile-shell">
      <Link to="/suche?type=landlord" className="text-link"><ArrowLeft size={16} /> Zum Verzeichnis</Link>
      <header className="profile-heading">
        <h1>{landlord.name}</h1>
        <p className="profile-meta">
          {[kind, landlord.city ? `Sitz: ${landlord.city}` : null].filter(Boolean).join(" · ")}
          {landlord.operationalStatus === "DISSOLVED" && " · aufgelöst"}
        </p>
        <p className="verification-line">
          {landlord.verificationStatus !== "UNVERIFIED" && <BadgeCheck size={15} aria-hidden="true" />} {landlord.verificationLabel}
          {p?.landlord.verificationNotice && <span className="relation-meta"> · {p.landlord.verificationNotice}</span>}
        </p>
      </header>

      <div className="profile-layout">
        <div>
          <ExperienceSection targetType="landlord" targetId={landlord.id} />

          <section className="profile-section" aria-labelledby="buildings-title">
            <h2 id="buildings-title">Bekannte Gebäude</h2>
            {properties.length ? (
              <ul className="building-list">
                {properties.map((property) => (
                  <li key={property.id}>
                    <Link to={`/gebaeude/${property.id}`} className="text-link">{property.street} {property.houseNumber}, {property.postalCode} {property.city}</Link>
                    <span className="relation-meta">
                      {property.roles.map((r) => `${r.roleLabel}${r.unitLabel ? ` (nur ${r.unitLabel})` : ""}${r.status === "former" ? " – früher" : ""}`).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-hint">Für dieses Unternehmen sind noch keine Gebäude bestätigt. Zuordnungen entstehen nur aus geprüften Meldungen.</p>
            )}
          </section>

          <section className="profile-section" aria-labelledby="external-title">
            <h2 id="external-title">Externe Erfahrungsberichte</h2>
            <ExternalExperiences landlordId={landlord.id} />
          </section>
        </div>

        <aside className="profile-aside">
          <section>
            <h2>Unternehmensinformationen</h2>
            <dl className="fact-list">
              {p?.landlord.legalName && <><dt>Registrierter Name</dt><dd>{p.landlord.legalName}</dd></>}
              {p?.landlord.legalFormLabel && <><dt>Rechtsform</dt><dd>{p.landlord.legalFormLabel}</dd></>}
              {landlord.city && <><dt>Sitz</dt><dd>{[p?.landlord.postalCode, landlord.city].filter(Boolean).join(" ")}{landlord.stateLabel ? `, ${landlord.stateLabel}` : ""}</dd></>}
              {!!p?.aliases.length && <><dt>Auch bekannt als</dt><dd>{p.aliases.slice(0, 6).map((a) => a.name).join(", ")}</dd></>}
              {p?.identifiers.map((identifier) => (
                <div key={identifier.value} className="fact-row">
                  <dt>{identifier.schemeLabel}</dt>
                  <dd>
                    {identifier.display}{" "}
                    {identifier.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="text-link">{link.label}</a>)}
                  </dd>
                </div>
              ))}
            </dl>
            {landlord.website && <a href={landlord.website} target="_blank" rel="noopener noreferrer" className="text-link">Unternehmenswebsite <ArrowUpRight size={15} /><span className="sr-only"> (neuer Tab)</span></a>}
          </section>

          {!!p?.relations.length && (
            <section>
              <h2>Konzern</h2>
              <dl className="fact-list">
                {p.relations.map((relation) => (
                  <div key={`${relation.direction}-${relation.other.id}`} className="fact-row">
                    <dt>{relation.label}</dt>
                    <dd><Link to={`/vermieter/${relation.other.id}`} className="text-link">{relation.other.name}</Link></dd>
                  </div>
                ))}
              </dl>
              <p className="field-hint">Mutter- und Tochtergesellschaften sind eigenständige juristische Personen.</p>
            </section>
          )}

          {!!p?.sources.length && (
            <section>
              <h2>Quellen</h2>
              <ul className="source-list">
                {p.sources.map((source) => (
                  <li key={source.sourceKey}>
                    <strong>{source.displayName}</strong> ({source.license}) · Stand {dateFormat.format(new Date(source.lastSeenAt))}
                    {source.recordUrls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-link block">Datensatz ansehen</a>)}
                    {source.attribution && <span className="relation-meta">{source.attribution}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2>Über die Bewertungen</h2>
            <p>Die Bewertungen stammen von WohnCheck-Nutzern. Der Durchschnitt enthält ausschließlich veröffentlichte WohnCheck-Bewertungen, keine Bewertungen anderer Plattformen.</p>
          </section>

          <details>
            <summary>Fehler im Profil melden</summary>
            <ProfileReportForm landlordId={landlord.id} />
          </details>
        </aside>
      </div>
    </div></div>
  );
}
