import { StarRating } from "./StarRating";
import { ThumbsUp, Flag, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReviewViewModel } from "@/features/reviews/review-types";

interface ReviewCardProps {
  review: ReviewViewModel;
  onReport?: (id: string) => void;
}

export function ReviewCard({ review, onReport }: ReviewCardProps) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StarRating rating={review.rating_overall} size={16} />
            <span className="text-xs text-muted-foreground">{review.created_at}</span>
          </div>
          <h4 className="font-semibold text-foreground mb-1 truncate">{review.title}</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">{review.text}</p>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {review.user_verified && <BadgeCheck size={14} className="text-primary" />}
              {review.user_name}
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground gap-1">
              <ThumbsUp size={13} /> {review.helpful_count}
            </Button>
            {onReport && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground gap-1"
                onClick={() => onReport(review.id)}
              >
                <Flag size={13} /> Melden
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
