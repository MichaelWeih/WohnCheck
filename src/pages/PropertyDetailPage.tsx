import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { properties, getReviewsForTarget } from "@/data/mock-data";
import { getMappedPropertyById, getPropertyAddress } from "@/data/property-map-data";
import { PropertyMap } from "@/components/PropertyMap";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-context";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { fetchReviewAggregate, fetchReviews, reportReview } from "@/features/reviews/review-api";
import { MapPin, Building2, PenSquare } from "lucide-react";
import { toast } from "sonner";

export default function PropertyDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const property = properties.find((entry) => entry.id === id);
  const mappedProperty = id ? getMappedPropertyById(id) : undefined;

  if (!property) {
    return <div className="container py-20 text-center text-muted-foreground">Gebäude nicht gefunden.</div>;
  }

  const { data: apiReviews } = useQuery({
    queryKey: ["reviews", "property", property.id],
    queryFn: () => fetchReviews("property", property.id),
  });

  const { data: apiAggregate } = useQuery({
    queryKey: ["review-aggregate", "property", property.id],
    queryFn: () => fetchReviewAggregate("property", property.id),
  });

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
