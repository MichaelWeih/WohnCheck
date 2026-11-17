import { apiRequest } from "@/lib/api";
import { ReviewTargetType, reviewTypeToApiMap } from "./review-targets";
import { ApiReview, ReviewAggregate } from "./review-types";

export type CreateReviewPayload = {
  targetType: ReviewTargetType;
  targetId: string;
  title: string;
  text: string;
  overallRating: number;
  categoryRatings: Record<string, number>;
  token: string;
};

export function createReview(payload: CreateReviewPayload) {
  return apiRequest("/reviews", {
    method: "POST",
    token: payload.token,
    body: JSON.stringify({
      targetType: reviewTypeToApiMap[payload.targetType],
      targetId: payload.targetId,
      title: payload.title,
      text: payload.text,
      overallRating: payload.overallRating,
      categoryRatings: payload.categoryRatings,
    }),
  });
}

export function fetchReviews(targetType: ReviewTargetType, targetId: string) {
  const query = new URLSearchParams({
    targetType: reviewTypeToApiMap[targetType],
    targetId,
    status: "PUBLISHED",
  });

  return apiRequest<ApiReview[]>(`/reviews?${query.toString()}`, {
    method: "GET",
  });
}

export function fetchLatestReviews(limit: number) {
  const query = new URLSearchParams({
    status: "PUBLISHED",
    limit: String(limit),
  });

  return apiRequest<ApiReview[]>(`/reviews?${query.toString()}`, {
    method: "GET",
  });
}

export function fetchReviewAggregate(targetType: ReviewTargetType, targetId: string) {
  return apiRequest<ReviewAggregate>(
    `/reviews/aggregate/${reviewTypeToApiMap[targetType]}/${targetId}`,
    { method: "GET" },
  );
}

export function reportReview(reviewId: string, reason: string, token: string) {
  return apiRequest(`/reviews/${reviewId}/report`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason }),
  });
}

export function fetchModerationQueue(token: string) {
  return apiRequest<ApiReview[]>("/admin/reviews/moderation-queue", {
    method: "GET",
    token,
  });
}

export function moderateReview(
  reviewId: string,
  action: "publish" | "reject",
  token: string,
  reason?: string,
) {
  return apiRequest(`/reviews/${reviewId}/moderate`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      action,
      reason,
    }),
  });
}
