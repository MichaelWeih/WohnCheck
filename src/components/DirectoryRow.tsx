import { Link } from "react-router-dom";
import { ChevronRight, Building2, Star, House, MapPin } from "lucide-react";
interface DirectoryRowProps {
  to: string; title: string; subtitle: string; rating: number | null; reviewCount: number; onFocus?: () => void;
}
export function DirectoryRow({ to, title, subtitle, rating, reviewCount, onFocus }: DirectoryRowProps) {
  const Icon = to.startsWith("/gebaeude") ? House : to.startsWith("/nachbarschaft") ? MapPin : Building2;
  return <Link to={to} className="directory-row" onMouseEnter={onFocus} onFocus={onFocus}>
    <span className="directory-symbol" aria-hidden="true"><Icon size={21} strokeWidth={1.5} /></span>
    <span className="directory-copy"><span className="directory-name">{title}</span><span className="directory-subtitle">{subtitle}</span>
      <span className="directory-reviews">{reviewCount > 0 && rating != null ? <><Star size={13} aria-hidden="true" /><strong>{rating.toFixed(1)} / 5</strong><span>· {reviewCount} {reviewCount === 1 ? "WohnCheck-Bewertung" : "WohnCheck-Bewertungen"}</span></> : "Noch keine WohnCheck-Bewertungen"}</span>
    </span>
    <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
  </Link>;
}
