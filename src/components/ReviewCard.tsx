import { StarRating } from "./StarRating";
import { Flag, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewViewModel } from "@/features/reviews/review-types";
export function ReviewCard({ review, onReport }: { review: ReviewViewModel; onReport?: (id: string) => void }) {
  return <article id={`review-${review.id}`} className="review-article">
    <div className="flex flex-wrap items-center gap-3 mb-3"><StarRating rating={review.rating_overall} size={15} /><span className="text-xs text-muted-foreground">WohnCheck · {review.created_at}</span></div>
    <h3 className="font-semibold mb-2">{review.title}</h3>
    <p className="text-sm leading-relaxed whitespace-pre-line">{review.text}</p>
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3"><span className="text-xs text-muted-foreground flex items-center gap-1">{review.user_verified && <BadgeCheck size={14} className="text-primary" aria-label="Verifizierter Nutzer" />}{review.user_name}</span>
      {onReport && <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => onReport(review.id)}><Flag size={13} /> Melden</Button>}
    </div>
  </article>;
}
