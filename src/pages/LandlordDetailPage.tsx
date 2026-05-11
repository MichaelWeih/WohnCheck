import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { landlords, properties as fallbackProperties, getReviewsForTarget, Property } from "@/data/mock-data";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { ReviewCard } from "@/components/ReviewCard";
import { LandlordLogo } from "@/components/LandlordLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-context";
import { adaptLandlord, adaptProperty } from "@/features/directory/directory-adapter";
import { fetchLandlord } from "@/features/directory/directory-api";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { fetchReviewAggregate, fetchReviews, reportReview } from "@/features/reviews/review-api";
import { ReviewViewModel } from "@/features/reviews/review-types";
import type { ApiLandlordExternalLink, ApiLandlordProfile, ApiLandlordPublicSource, ApiLandlordScore, ApiListingCard, ApiProperty } from "@/features/directory/directory-types";
import { ArrowRight, Building2, CalendarClock, Database, ExternalLink, FileSearch, Globe, Home, Info, MapPin, PenSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type LandlordPropertyItem = Property & {
  wohncheckScore?: number | null;
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return null;
}

function ExternalSourcesPanel({ reviews }: { reviews: ReviewViewModel[] }) {
  if (reviews.length === 0) {
    return null;
  }

  const averageRating =
    reviews.reduce((sum, review) => sum + review.rating_overall, 0) / reviews.length;

  return (
    <Card className="mb-8 overflow-hidden border-primary/20 bg-primary/[0.03]">
      <div className="border-b bg-background/70 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <FileSearch size={14} /> Externe Quellenlage
            </div>
            <h2 className="text-lg font-semibold text-foreground">Was öffentliche Quellen nahelegen</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Redaktionell zusammengefasste Signale aus öffentlichen Bewertungsprofilen, Medienberichten und
              Mietervereinsquellen. Diese Inhalte sind nicht Teil der WohnCheck-Nutzerbewertungen.
            </p>
          </div>
          <div className="shrink-0 rounded-lg border bg-card px-4 py-3 text-center">
            <div className="text-xs text-muted-foreground">Quellen-Score</div>
            <div className="text-2xl font-bold text-foreground">{averageRating.toFixed(1)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border bg-card p-4 md:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">
                  Quellen-Zusammenfassung
                </div>
                <h3 className="text-base font-semibold text-foreground">{review.title}</h3>
              </div>
              <div className="shrink-0 rounded-md bg-secondary px-3 py-1.5 text-sm font-bold text-foreground">
                {review.rating_overall.toFixed(1)}
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{review.text}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 border-t bg-background/70 px-5 py-3 text-xs text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0 text-primary" />
        <p>
          Quellen-Digests helfen bei der ersten Einordnung. Für verbindliche Entscheidungen sollten die
          Originalquellen und aktuelle WohnCheck-Nutzerbewertungen getrennt betrachtet werden.
        </p>
      </div>
    </Card>
  );
}

function LandlordScoreCard({ score }: { score?: ApiLandlordScore }) {
  if (!score) {
    return (
      <Card className="mb-8 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <ShieldCheck size={16} />
          Vermieter-Score
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Für diesen Vermieter liegen noch nicht genügend strukturierte Daten für einen erklärbaren Vermieter-Score vor.
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
            <div className="text-xs text-muted-foreground">Datenqualität</div>
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
              Wert: {factor.value === null || factor.value === undefined ? "nicht genügend Daten" : `${factor.value} / 100`}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LandlordProfileFacts({
  profile,
  externalLinks,
}: {
  profile?: ApiLandlordProfile;
  externalLinks?: ApiLandlordExternalLink[];
}) {
  const facts = [
    { label: "Bekannte Wohnungen", value: profile?.knownListingsCount ?? 0, icon: Home },
    { label: "Aktiv verfügbar", value: profile?.activeListingsCount ?? 0, icon: Building2 },
    {
      label: "Ø Quadratmeterpreis",
      value: profile?.averagePricePerSqm ? `${profile.averagePricePerSqm.toFixed(2)} €/m²` : "noch offen",
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

function LandlordPublicSourcesPanel({ sources }: { sources?: ApiLandlordPublicSource[] }) {
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
                  {source.extractedText ? `Gefundener Eintrag: ${source.extractedText}` : "Öffentliche Quelle mit Vermieterbezug"}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  Quelle öffnen <ExternalLink size={14} />
                </a>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LandlordPropertiesPanel({ properties }: { properties: LandlordPropertyItem[] }) {
  return (
    <Card className="mb-8 p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Home size={16} />
            Wohnungen und Gebäude
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Objekte dieses Vermieters in WohnCheck
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jede Adresse führt direkt zur Detailseite mit Bewertungen und WohnCheck-Score.
          </p>
        </div>
        <div className="shrink-0 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          {properties.length} {properties.length === 1 ? "Objekt" : "Objekte"}
        </div>
      </div>

      {properties.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Für diesen Vermieter sind noch keine Wohnungen oder Gebäude hinterlegt.
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
                          : "–"}
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

function LandlordListingsPreview({ listings }: { listings?: ApiListingCard[] }) {
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
            Angebote stammen aus erlaubten Importen, Partner-Feeds oder geprüften strukturierten Quellen.
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
              ? `${Math.abs(deviation).toFixed(0)} % über Stadtteildurchschnitt`
              : `${Math.abs(deviation).toFixed(0)} % günstiger als der Stadtteildurchschnitt`;

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
                    Quelle: {listing.sourceProvider?.name ?? "WohnCheck"} · Datenqualität {listing.dataQualityScore} %
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Kaltmiete</div>
                    <div className="font-semibold">{listing.coldRent ? `${listing.coldRent.toFixed(0)} €` : "–"}</div>
                  </div>
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">€/m²</div>
                    <div className="font-semibold">{listing.pricePerSqm ? `${listing.pricePerSqm.toFixed(2)} €` : "–"}</div>
                  </div>
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Zimmer</div>
                    <div className="font-semibold">{listing.rooms ?? "–"}</div>
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

export default function LandlordDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const city = searchParams.get("city");
  const { accessToken } = useAuth();
  const fallbackLandlord = landlords.find((entry) => entry.id === id);

  const { data: apiLandlord, isLoading: isLandlordLoading } = useQuery({
    queryKey: ["landlord", id, city],
    queryFn: () => fetchLandlord(id ?? "", city),
    enabled: Boolean(id),
    retry: false,
  });

  const landlord = apiLandlord ? adaptLandlord(apiLandlord) : fallbackLandlord;
  const landlordProperties: LandlordPropertyItem[] = apiLandlord?.properties
    ? apiLandlord.properties.map((property: ApiProperty) => ({
        ...adaptProperty(property),
        wohncheckScore: toNumber(property.latestScore?.totalScore),
      }))
    : fallbackProperties
        .filter((property) => property.landlord_id === landlord?.id)
        .map((property) => ({
          ...property,
          wohncheckScore: null,
        }));
  const { data: apiReviews } = useQuery({
    queryKey: ["reviews", "landlord", landlord?.id],
    queryFn: () => fetchReviews("landlord", landlord?.id ?? ""),
    enabled: Boolean(landlord?.id),
  });

  const { data: apiAggregate } = useQuery({
    queryKey: ["review-aggregate", "landlord", landlord?.id],
    queryFn: () => fetchReviewAggregate("landlord", landlord?.id ?? ""),
    enabled: Boolean(landlord?.id),
  });

  if (isLandlordLoading && !landlord) {
    return <div className="container py-20 text-center text-muted-foreground">Vermieter wird geladen...</div>;
  }

  if (!landlord) {
    return <div className="container py-20 text-center text-muted-foreground">Vermieter nicht gefunden.</div>;
  }

  const allReviews = apiReviews?.map(adaptApiReview) ?? getReviewsForTarget("landlord", landlord.id);
  const externalSourceReviews = allReviews.filter(
    (review) => review.verification_level === "public-source-summary",
  );
  const reviews = allReviews.filter((review) => review.verification_level !== "public-source-summary");
  const overallRating = apiAggregate?.overallRating ?? landlord.rating_overall;
  const reviewCount = apiAggregate?.reviewCount ?? landlord.review_count;
  const hasUserReviews = reviewCount > 0;
  const ratingEntries =
    apiAggregate && Object.keys(apiAggregate.categoryRatings).length > 0
      ? Object.entries(apiAggregate.categoryRatings)
      : Object.entries(landlord.ratings);

  const handleReport = async (reviewId: string) => {
    if (!accessToken) {
      toast.error("Bitte melde dich an, um Bewertungen zu melden.");
      return;
    }

    try {
      await reportReview(reviewId, "Unpassender oder unwahrer Inhalt", accessToken);
      toast.success("Bewertung wurde gemeldet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Meldung konnte nicht gespeichert werden.";
      toast.error(message);
    }
  };

  return (
    <div className="container py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-6 mb-8 md:flex-row">
          {landlord.logo_url ? (
            <LandlordLogo name={landlord.name} logoUrl={landlord.logo_url} size="lg" />
          ) : hasUserReviews ? (
            <ScoreBadge score={overallRating} size="lg" />
          ) : null}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">{landlord.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 size={14} /> {landlord.company_type}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {landlord.city}
              </span>
              {landlord.website && (
                <a
                  href={landlord.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Globe size={14} /> Website
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              {hasUserReviews ? (
                <>
                  <StarRating rating={overallRating} size={18} showValue />
                  <span className="text-sm text-muted-foreground">({reviewCount} Bewertungen)</span>
                </>
              ) : (
                <span className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                  Noch keine WohnCheck-Nutzerbewertungen
                </span>
              )}
            </div>
          </div>
          <Button asChild>
            <Link to={`/bewertung/neu?targetType=landlord&targetId=${landlord.id}`} className="gap-2 self-start">
              <PenSquare size={16} /> Bewerten
            </Link>
          </Button>
        </div>

        <LandlordProfileFacts profile={apiLandlord?.profile} externalLinks={apiLandlord?.externalLinks} />

        <LandlordScoreCard score={apiLandlord?.score} />

        <LandlordListingsPreview listings={apiLandlord?.listings} />

        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-4">Bewertungen im Detail</h2>
          {ratingEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine WohnCheck-Nutzerbewertungen vorhanden.
            </p>
          ) : (
            <div className="space-y-3">
              {ratingEntries.map(([key, value]) => (
                <RatingBar key={key} label={key} value={value} />
              ))}
            </div>
          )}
        </Card>

        <LandlordPropertiesPanel properties={landlordProperties} />

        <ExternalSourcesPanel reviews={externalSourceReviews} />

        <LandlordPublicSourcesPanel sources={apiLandlord?.publicSources} />

        <h2 className="font-semibold text-foreground text-lg mb-4">Erfahrungsberichte ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Bewertungen vorhanden.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} onReport={handleReport} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
