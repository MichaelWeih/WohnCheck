import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ReviewCard } from "@/components/ReviewCard";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { Button } from "@/components/ui/button";
import { useTargetReviews } from "@/features/reviews/use-target-reviews";
import type { ReviewTargetType } from "@/features/reviews/review-targets";

export function ExperienceSection({ targetType, targetId }: { targetType: ReviewTargetType; targetId: string }) {
  const { reviews, overallRating, reviewCount, ratingEntries, isLoadingReviews, hasReviewError, handleReport } = useTargetReviews(targetType, targetId);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash.startsWith("#review-") && !isLoadingReviews) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash, isLoadingReviews, reviews.length]);
  return <section className="profile-section" aria-labelledby="experiences-title">
    <div className="section-heading"><h2 id="experiences-title">Erfahrungen auf WohnCheck</h2></div>
    {isLoadingReviews ? <p className="state-message" role="status">Erfahrungen werden geladen …</p> : hasReviewError ? <p className="state-message" role="alert">Die Bewertungen konnten nicht geladen werden. Bitte lade die Seite erneut.</p> : <>
      {reviewCount > 0 && <div className="review-summary"><strong className="review-summary-number">{overallRating.toFixed(1)}</strong><div><StarRating rating={overallRating} /><p>von 5 Punkten · {reviewCount} {reviewCount === 1 ? "Bewertung" : "Bewertungen"} auf WohnCheck</p></div></div>}
      {ratingEntries.length > 0 && <details className="border-y mb-6"><summary>Bewertungen nach Themen</summary><div className="space-y-3 pb-5">{ratingEntries.map(([key, value]) => <RatingBar key={key} label={key} value={value} />)}</div></details>}
      {reviews.length ? reviews.map(review => <ReviewCard key={review.id} review={review} onReport={handleReport} />) : <div className="state-message"><h2>Noch keine Erfahrungen geteilt.</h2><p>Du kennst diesen Wohnort oder Vermieter? Deine Erfahrung hilft anderen bei ihrer Entscheidung.</p></div>}
    </>}
    <Button asChild className="mt-4"><Link to={`/bewertung/neu?targetType=${targetType}&targetId=${targetId}`}>Erfahrung teilen</Link></Button>
  </section>;
}
