import { useParams } from "react-router-dom";
import { neighborhoods, getReviewsForTarget } from "@/data/mock-data";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, PenSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function NeighborhoodDetailPage() {
  const { id } = useParams();
  const neighborhood = neighborhoods.find((n) => n.id === id);

  if (!neighborhood) return <div className="container py-20 text-center text-muted-foreground">Nachbarschaft nicht gefunden.</div>;

  const reviews = getReviewsForTarget("neighborhood", neighborhood.id);

  return (
    <div className="container py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <ScoreBadge score={neighborhood.rating_overall} size="lg" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">{neighborhood.district_name}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin size={14} /> {neighborhood.postal_code} {neighborhood.city}</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <StarRating rating={neighborhood.rating_overall} size={18} showValue />
              <span className="text-sm text-muted-foreground">({neighborhood.review_count} Bewertungen)</span>
            </div>
          </div>
          <Button asChild>
            <Link to="/bewertung/neu" className="gap-2 self-start"><PenSquare size={16} /> Bewerten</Link>
          </Button>
        </div>

        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-4">Bewertungen im Detail</h2>
          <div className="space-y-3">
            {Object.entries(neighborhood.ratings).map(([key, val]) => (
              <RatingBar key={key} label={key} value={val} />
            ))}
          </div>
        </Card>

        <h2 className="font-semibold text-foreground text-lg mb-4">Erfahrungsberichte ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Bewertungen vorhanden.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} onReport={(rid) => toast.success(`Bewertung ${rid} wurde gemeldet.`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
