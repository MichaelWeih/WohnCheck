import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: number;
  showValue?: boolean;
  interactive?: boolean;
  onChange?: (rating: number) => void;
}

export function StarRating({ rating, max = 5, size = 18, showValue = false, interactive = false, onChange }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(rating);
        return (
          <Star
            key={i}
            size={size}
            className={`${filled ? "fill-star text-star" : "fill-star-empty text-star-empty"} ${interactive ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
            onClick={interactive && onChange ? () => onChange(i + 1) : undefined}
          />
        );
      })}
      {showValue && <span className="ml-1.5 text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>}
    </div>
  );
}
