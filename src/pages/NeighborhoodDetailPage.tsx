import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { neighborhoods, getReviewsForTarget } from "@/data/mock-data";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-context";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { fetchReviewAggregate, fetchReviews, reportReview } from "@/features/reviews/review-api";
import { MapPin, PenSquare } from "lucide-react";
import { toast } from "sonner";

export default function NeighborhoodDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const neighborhood = neighborhoods.find((entry) => entry.id === id);

  if (!neighborhood) {
    return <div className="container py-20 text-center text-muted-foreground">Nachbarschaft nicht gefunden.</div>;
  }

  const { data: apiReviews } = useQuery({
    queryKey: ["reviews", "neighborhood", neighborhood.id],
    queryFn: () => fetchReviews("neighborhood", neighborhood.id),
  });

  const { data: apiAggregate } = useQuery({
    queryKey: ["review-aggregate", "neighborhood", neighborhood.id],
    queryFn: () => fetchReviewAggregate("neighborhood", neighborhood.id),
  });

  const reviews = apiReviews?.map(adaptApiReview) ?? getReviewsForTarget("neighborhood", neighborhood.id);
  const overallRating = apiAggregate?.overallRating ?? neighborhood.rating_overall;
  const reviewCount = apiAggregate?.reviewCount ?? neighborhood.review_count;
  const ratingEntries =
    apiAggregate && Object.keys(apiAggregate.categoryRatings).length > 0
      ? Object.entries(apiAggregate.categoryRatings)
      : Object.entries(neighborhood.ratings);

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
            <h1 className="text-3xl font-bold text-foreground">{neighborhood.district_name}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {neighborhood.postal_code} {neighborhood.city}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <StarRating rating={overallRating} size={18} showValue />
              <span className="text-sm text-muted-foreground">({reviewCount} Bewertungen)</span>
            </div>
          </div>
          <Button asChild>
            <Link to={`/bewertung/neu?targetType=neighborhood&targetId=${neighborhood.id}`} className="gap-2 self-start">
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
