import { ApiReview, ReviewViewModel } from "./review-types";

const apiToViewStatusMap: Record<ApiReview["status"], ReviewViewModel["status"]> = {
  PENDING: "pending",
  PUBLISHED: "published",
  REPORTED: "reported",
  REJECTED: "rejected",
};

const apiToViewTargetTypeMap: Record<ApiReview["targetType"], ReviewViewModel["target_type"]> = {
  LANDLORD: "landlord",
  PROPERTY: "property",
  NEIGHBORHOOD: "neighborhood",
};

export function adaptApiReview(review: ApiReview): ReviewViewModel {
  return {
    id: review.id,
    user_name: review.user.displayName,
    user_verified: review.user.isVerified,
    title: review.title,
    text: review.text,
    rating_overall: Number(review.overallRating),
    created_at: new Date(review.createdAt).toLocaleDateString("de-DE"),
    helpful_count: review.helpfulCount,
    status: apiToViewStatusMap[review.status],
    target_type: apiToViewTargetTypeMap[review.targetType],
    target_id: review.targetId,
  };
}
