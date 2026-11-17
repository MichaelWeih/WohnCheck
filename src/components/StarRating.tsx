import { Star } from "lucide-react";
interface StarRatingProps { rating: number | null; max?: number; size?: number; showValue?: boolean; interactive?: boolean; onChange?: (rating: number) => void; label?: string; }
export function StarRating({ rating, max = 5, size = 18, showValue = false, interactive = false, onChange, label = "Bewertung" }: StarRatingProps) {
  if (rating === null && !interactive) return <span className="text-sm text-muted-foreground">Noch keine Bewertungen</span>;
  const value = rating ?? 0;
  return <div className="flex items-center gap-1" role={interactive ? "group" : "img"} aria-label={interactive ? label : `${value.toFixed(1)} von ${max} Sternen`}>
    {Array.from({ length: max }, (_, i) => {
      const star = <Star size={size} aria-hidden="true" className={i < Math.round(value) ? "fill-star text-star" : "fill-star-empty text-star-empty"} />;
      return interactive ? <button key={i} type="button" className="rating-choice" aria-label={`${label}: ${i + 1} von ${max} Sternen`} aria-pressed={value === i + 1} onClick={() => onChange?.(i + 1)}>{star}</button> : <span key={i}>{star}</span>;
    })}
    {showValue && <span aria-hidden="true" className="ml-1.5 text-sm font-semibold">{value.toFixed(1)}</span>}
  </div>;
}
