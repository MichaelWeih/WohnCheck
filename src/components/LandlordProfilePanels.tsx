import { StarRating } from "@/components/StarRating";
import type { Property } from "@/data/mock-data";
type LandlordPropertyItem = Property & { wohncheckScore?: number | null };
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LandlordLogo } from "@/components/LandlordLogo";
import type { ApiLandlordProfile, ApiLandlordPublicSource, ApiLandlordExternalLink, ApiLandlordScore, ApiListingCard } from "@/features/directory/directory-types";
import { ArrowRight, Building2, CalendarClock, Database, ExternalLink, FileSearch, Globe, Home, Info, MapPin, PenSquare, ShieldCheck } from "lucide-react";
export function LandlordScoreCard({ score }: { score?: ApiLandlordScore }) {
  if (!score) {
    return (
      <Card className="mb-8 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <ShieldCheck size={16} />
          Vermieter-Score
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          FÃ¼r diesen Vermieter liegen noch nicht genÃ¼gend strukturierte Daten fÃ¼r einen erklÃ¤rbaren Vermieter-Score vor.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-8 overflow-hidden">
      <div className="border-b bg-primary/[0.03] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck size={16} />
              {score.label}
            </div>
            <h2 className="mt-2 text-2xl font-bold text-foreground">{score.totalScore} / 100</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{score.note}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3 text-center">
            <div className="text-xs text-muted-foreground">DatenqualitÃ¤t</div>
            <div className="text-2xl font-bold text-foreground">{score.confidenceScore} %</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2">
        {score.factors.map((factor) => (
          <div key={factor.key} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{factor.label}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{factor.explanation}</p>
              </div>
              <div className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                {Math.round(factor.weight * 100)} %
              </div>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Wert: {factor.value === null || factor.value === undefined ? "nicht genÃ¼gend Daten" : `${factor.value} / 100`}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function LandlordProfileFacts({
  profile,
  externalLinks,
}: {
  profile?: ApiLandlordProfile;
  externalLinks?: ApiLandlordExternalLink[];
}) {
  const facts = [
    { label: "Bekannte Wohnungen", value: profile?.knownListingsCount ?? 0, icon: Home },
    { label: "Aktiv verfÃ¼gbar", value: profile?.activeListingsCount ?? 0, icon: Building2 },
    {
      label: "Ã˜ Quadratmeterpreis",
      value: profile?.averagePricePerSqm ? `${profile.averagePricePerSqm.toFixed(2)} â‚¬/mÂ²` : "noch offen",
      icon: Database,
    },
    {
      label: "Letzte Aktualisierung",
      value: profile?.lastUpdatedAt ? new Date(profile.lastUpdatedAt).toLocaleDateString("de-DE") : "noch offen",
      icon: CalendarClock,
    },
  ];

  return (
    <Card className="mb-8 p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Vermieterprofil</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {profile?.summary ?? "Basisprofil aus WohnCheck-Daten, Erfahrungsberichten und angebundenen Quellen."}
          </p>
          {profile?.activeDistricts && profile.activeDistricts.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Aktiv in: {profile.activeDistricts.join(", ")}
            </p>
          )}
        </div>

        {externalLinks && externalLinks.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {externalLinks.map((link) => (
              <Button key={`${link.type}-${link.url}`} asChild variant="outline" size="sm">
                <a href={link.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {link.label}
                </a>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div key={fact.label} className="rounded-lg border bg-background px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon size={14} />
                {fact.label}
              </div>
              <div className="mt-1 font-semibold text-foreground">{fact.value}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function LandlordPublicSourcesPanel({ sources }: { sources?: ApiLandlordPublicSource[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <Card className="mb-8 p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
        <FileSearch size={16} />
        Datenquellen
      </div>
      <div className="space-y-3">
        {sources.map((source) => (
          <div key={`${source.sourceKey}-${source.sourceUrl}`} className="rounded-lg border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{source.sourceName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {source.extractedText ? `Gefundener Eintrag: ${source.extractedText}` : "Ã–ffentliche Quelle mit Vermieterbezug"}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  Quelle Ã¶ffnen <ExternalLink size={14} />
                </a>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function LandlordPropertiesPanel({ properties }: { properties: LandlordPropertyItem[] }) {
  return (
    <Card className="mb-8 p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Home size={16} />
            Wohnungen und GebÃ¤ude
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Objekte dieses Vermieters in WohnCheck
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jede Adresse fÃ¼hrt direkt zur Detailseite mit Bewertungen und WohnCheck-Score.
          </p>
        </div>
        <div className="shrink-0 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          {properties.length} {properties.length === 1 ? "Objekt" : "Objekte"}
        </div>
      </div>

      {properties.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          FÃ¼r diesen Vermieter sind noch keine Wohnungen oder GebÃ¤ude hinterlegt.
        </p>
      ) : (
        <div className="grid gap-3">
          {properties.map((property) => {
            const address = `${property.street} ${property.house_number}`;
            const hasReviews = property.review_count > 0;

            return (
              <Link
                key={property.id}
                to={`/gebaeude/${property.id}`}
                className="group rounded-lg border border-border p-4 transition-all hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{address}</h3>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin size={14} />
                      {property.postal_code} {property.city}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {hasReviews ? (
                        <>
                          <StarRating rating={property.rating_overall} size={14} />
                          <span className="text-xs text-muted-foreground">
                            {property.review_count} {property.review_count === 1 ? "Bewertung" : "Bewertungen"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Noch keine Nutzerbewertungen</span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="rounded-lg border bg-background px-3 py-2 text-center">
                      <div className="text-[11px] text-muted-foreground">WohnCheck-Score</div>
                      <div className="text-lg font-bold text-foreground">
                        {property.wohncheckScore !== null && property.wohncheckScore !== undefined
                          ? property.wohncheckScore.toFixed(0)
                          : "â€“"}
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function LandlordListingsPreview({ listings }: { listings?: ApiListingCard[] }) {
  if (!listings || listings.length === 0) return null;

  return (
    <Card className="mb-8 p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Home size={16} />
            Freie Mietwohnungen
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Aktuell bekannte Angebote</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Angebote stammen aus erlaubten Importen, Partner-Feeds oder geprÃ¼ften strukturierten Quellen.
          </p>
        </div>
        <div className="shrink-0 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          {listings.length} {listings.length === 1 ? "Angebot" : "Angebote"}
        </div>
      </div>

      <div className="grid gap-3">
        {listings.map((listing) => {
          const deviation = listing.priceDeviationPercent;
          const deviationText = deviation === null || deviation === undefined
            ? "kein Stadtteilvergleich"
            : deviation > 0
              ? `${Math.abs(deviation).toFixed(0)} % Ã¼ber Stadtteildurchschnitt`
              : `${Math.abs(deviation).toFixed(0)} % gÃ¼nstiger als der Stadtteildurchschnitt`;

          return (
            <Link
              key={listing.id}
              to={`/angebote/${listing.id}`}
              className="rounded-lg border border-border p-4 transition-all hover:border-primary/50 hover:bg-primary/[0.03]"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{listing.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{listing.address}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Quelle: {listing.sourceProvider?.name ?? "WohnCheck"} Â· DatenqualitÃ¤t {listing.dataQualityScore} %
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Kaltmiete</div>
                    <div className="font-semibold">{listing.coldRent ? `${listing.coldRent.toFixed(0)} â‚¬` : "â€“"}</div>
                  </div>
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">â‚¬/mÂ²</div>
                    <div className="font-semibold">{listing.pricePerSqm ? `${listing.pricePerSqm.toFixed(2)} â‚¬` : "â€“"}</div>
                  </div>
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Zimmer</div>
                    <div className="font-semibold">{listing.rooms ?? "â€“"}</div>
                  </div>
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Vergleich</div>
                    <div className="font-semibold">{deviationText}</div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

