import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-context";
import { adaptApiReview } from "./review-adapter";
import { fetchReviewAggregate, fetchReviews, reportReview } from "./review-api";
import { ReviewTargetType } from "./review-targets";

/**
 * Loads published reviews and their aggregate for a target from the API.
 * Pass `undefined` as id to keep the queries disabled (e.g. while the target itself loads).
 */
export function useTargetReviews(targetType: ReviewTargetType, targetId: string | undefined) {
  const { accessToken } = useAuth();

  const reviewsQuery = useQuery({
    queryKey: ["reviews", targetType, targetId],
    queryFn: () => fetchReviews(targetType, targetId!),
    enabled: Boolean(targetId),
  });

  const aggregateQuery = useQuery({
    queryKey: ["review-aggregate", targetType, targetId],
    queryFn: () => fetchReviewAggregate(targetType, targetId!),
    enabled: Boolean(targetId),
  });

  const reviews = reviewsQuery.data?.map(adaptApiReview) ?? [];
  const aggregate = aggregateQuery.data;

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

  return {
    reviews,
    isLoadingReviews: reviewsQuery.isLoading || aggregateQuery.isLoading,
    hasReviewError: reviewsQuery.isError || aggregateQuery.isError,
    overallRating: aggregate?.overallRating ?? 0,
    reviewCount: aggregate?.reviewCount ?? 0,
    ratingEntries: Object.entries(aggregate?.categoryRatings ?? {}),
    handleReport,
  };
}
