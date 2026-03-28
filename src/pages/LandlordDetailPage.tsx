import { useParams, Link } from "react-router-dom";
import { landlords, getReviewsForTarget } from "@/data/mock-data";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { RatingBar } from "@/components/RatingBar";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Building2, Globe, MapPin, PenSquare } from "lucide-react";
import { toast } from "sonner";

export default function LandlordDetailPage() {
  const { id } = useParams();
  const landlord = landlords.find((l) => l.id === id);

  if (!landlord) return <div className="container py-20 text-center text-muted-foreground">Vermieter nicht gefunden.</div>;

  const reviews = getReviewsForTarget("landlord", landlord.id);

  return (
    <div className="container py-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <ScoreBadge score={landlord.rating_overall} size="lg" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">{landlord.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Building2 size={14} /> {landlord.company_type}</span>
              <span className="flex items-center gap-1"><MapPin size={14} /> {landlord.city}</span>
              {landlord.website && (
                <a href={landlord.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <Globe size={14} /> Website
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <StarRating rating={landlord.rating_overall} size={18} showValue />
              <span className="text-sm text-muted-foreground">({landlord.review_count} Bewertungen)</span>
            </div>
          </div>
          <Button asChild>
            <Link to="/bewertung/neu" className="gap-2 self-start">
              <PenSquare size={16} /> Bewerten
            </Link>
          </Button>
        </div>

        {/* Ratings */}
        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-4">Bewertungen im Detail</h2>
          <div className="space-y-3">
            {Object.entries(landlord.ratings).map(([key, val]) => (
              <RatingBar key={key} label={key} value={val} />
            ))}
          </div>
        </Card>

        {/* Reviews */}
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
