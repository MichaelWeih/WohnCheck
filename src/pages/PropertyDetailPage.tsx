import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { properties, getReviewsForTarget } from "@/data/mock-data";
import { getMappedPropertyById, getPropertyAddress } from "@/data/property-map-data";
import { PropertyMap } from "@/components/PropertyMap";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { ReviewCard } from "@/components/ReviewCard";
import { MarketPricePreview } from "@/components/MarketPricePreview";
import { PublicScoreCard } from "@/components/PublicScoreCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-context";
import { adaptProperty } from "@/features/directory/directory-adapter";
import { fetchExternalListingLinks, fetchMarketPrices, fetchProperty } from "@/features/directory/directory-api";
import type { ExternalListingLink } from "@/features/directory/directory-types";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { fetchReviewAggregate, fetchReviews, reportReview } from "@/features/reviews/review-api";
import { fetchScore } from "@/features/scores/score-api";
import { Building2, ExternalLink, Link2, MapPin, PenSquare } from "lucide-react";
import { toast } from "sonner";

const listingStatusLabels: Record<ExternalListingLink["status"], string> = {
  "api-ready": "API bereit",
  "credentials-required": "API-Zugang nötig",
  "permission-required": "Freigabe nötig",
  "search-link-only": "Suchlink",
};

function ExternalListingsPanel({ links }: { links?: ExternalListingLink[] }) {
  const verifiedLinks = links?.filter((link) => link.isVerified && link.listingUrl) ?? [];

  if (verifiedLinks.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8 p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Link2 size={16} />
            Externe Inserate
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Originalanzeigen finden</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            WohnCheck verlinkt zu möglichen Originalinseraten, wenn ein Portal die Adresse auffindbar macht.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {verifiedLinks.map((link) => (
          <a
            key={link.providerKey}
            href={link.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-border p-4 transition-all hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{link.providerName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{listingStatusLabels[link.status]}</p>
              </div>
              <ExternalLink size={17} className="shrink-0 text-muted-foreground group-hover:text-primary" />
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{link.note}</p>
          </a>
        ))}
      </div>
    </Card>
  );
}

export default function PropertyDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const fallbackProperty = properties.find((entry) => entry.id === id);
  const { data: apiProperty, isLoading: isPropertyLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: () => fetchProperty(id ?? ""),
    enabled: Boolean(id),
    retry: false,
  });
  const property = apiProperty ? adaptProperty(apiProperty) : fallbackProperty;
  const mappedProperty = id ? getMappedPropertyById(id) : undefined;

  const { data: apiReviews } = useQuery({
    queryKey: ["reviews", "property", property?.id],
    queryFn: () => fetchReviews("property", property?.id ?? ""),
    enabled: Boolean(property?.id),
  });

  const { data: apiAggregate } = useQuery({
    queryKey: ["review-aggregate", "property", property?.id],
    queryFn: () => fetchReviewAggregate("property", property?.id ?? ""),
    enabled: Boolean(property?.id),
  });

  const { data: publicScore } = useQuery({
    queryKey: ["score", "property", property?.id],
    queryFn: () => fetchScore("property", property?.id ?? ""),
    enabled: Boolean(property?.id),
  });
  const { data: listingLinks } = useQuery({
    queryKey: ["external-listing-links", property?.id],
    queryFn: () =>
      fetchExternalListingLinks({
        street: property?.street ?? "",
        houseNumber: property?.house_number ?? "",
        postalCode: property?.postal_code ?? "",
        city: property?.city ?? "",
      }),
    enabled: Boolean(property?.id),
    staleTime: 1000 * 60 * 30,
  });
  const { data: marketPrices } = useQuery({
    queryKey: ["market-prices", property?.city, property?.postal_code],
    queryFn: () => fetchMarketPrices({
      city: property?.city ?? "",
      postalCode: property?.postal_code ?? "",
    }),
    enabled: Boolean(property?.city),
    staleTime: 1000 * 60 * 60,
  });

  if (isPropertyLoading && !property) {
    return <div className="container py-20 text-center text-muted-foreground">Gebäude wird geladen...</div>;
  }

  if (!property) {
    return <div className="container py-20 text-center text-muted-foreground">Gebäude nicht gefunden.</div>;
  }

  const reviews = apiReviews?.map(adaptApiReview) ?? getReviewsForTarget("property", property.id);
  const overallRating = apiAggregate?.overallRating ?? property.rating_overall;
  const reviewCount = apiAggregate?.reviewCount ?? property.review_count;
  const ratingEntries =
    apiAggregate && Object.keys(apiAggregate.categoryRatings).length > 0
      ? Object.entries(apiAggregate.categoryRatings)
      : Object.entries(property.ratings);
  const address = getPropertyAddress(property);

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
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <ScoreBadge score={overallRating} size="lg" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">{address}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {property.postal_code} {property.city}
              </span>
              <Link to={`/vermieter/${property.landlord_id}`} className="flex items-center gap-1 text-primary hover:underline">
                <Building2 size={14} /> {property.landlord_name}
              </Link>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <StarRating rating={overallRating} size={18} showValue />
              <span className="text-sm text-muted-foreground">({reviewCount} Bewertungen)</span>
            </div>
          </div>
          <Button asChild>
            <Link to={`/bewertung/neu?targetType=property&targetId=${property.id}`} className="gap-2 self-start">
              <PenSquare size={16} /> Bewerten
            </Link>
          </Button>
        </div>

        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-4">Bewertungen im Detail</h2>
          <div className="space-y-3">
            {ratingEntries.map(([key, value]) => (
              <RatingBar key={key} label={key} value={value} />
            ))}
          </div>
        </Card>

        <PublicScoreCard score={publicScore} />

        <MarketPricePreview data={marketPrices} className="mb-8" />

        <ExternalListingsPanel links={listingLinks?.links} />

        {mappedProperty && (
          <PropertyMap
            properties={[mappedProperty]}
            selectedPropertyId={mappedProperty.id}
            className="mb-8"
            heightClassName="h-[320px]"
          />
        )}

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
