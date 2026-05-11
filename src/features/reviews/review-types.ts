export interface ApiReviewUser {
  id: string;
  displayName: string;
  isVerified: boolean;
}

export interface ApiReviewReport {
  id: string;
  reviewId: string;
  userId: string;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  updatedAt: string;
}

export interface ApiReview {
  id: string;
  targetType: "LANDLORD" | "PROPERTY" | "NEIGHBORHOOD";
  targetId: string;
  title: string;
  text: string;
  overallRating: number | string;
  categoryRatings: Record<string, number>;
  status: "PENDING" | "PUBLISHED" | "REPORTED" | "REJECTED";
  helpfulCount: number;
  verificationLevel?: string | null;
  createdAt: string;
  updatedAt: string;
  user: ApiReviewUser;
  reports: ApiReviewReport[];
}

export interface ReviewViewModel {
  id: string;
  user_name: string;
  user_verified: boolean;
  title: string;
  text: string;
  rating_overall: number;
  created_at: string;
  helpful_count: number;
  verification_level?: string | null;
  status: "published" | "pending" | "reported" | "rejected";
  target_type: "landlord" | "property" | "neighborhood";
  target_id: string;
}

export interface ReviewAggregate {
  reviewCount: number;
  overallRating: number | null;
  categoryRatings: Record<string, number>;
}
