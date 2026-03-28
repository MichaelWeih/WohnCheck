import { useState } from "react";
import { reviews as allReviews, reports } from "@/data/mock-data";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const reportedReviews = allReviews.filter((r) => r.status === "reported");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handleApprove = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    toast.success("Bewertung freigegeben.");
  };

  const handleReject = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    toast.success("Bewertung abgelehnt und entfernt.");
  };

  const pendingReports = reports.filter((r) => r.status === "pending");

  return (
    <div className="container py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Moderation</h1>
            <p className="text-sm text-muted-foreground">Gemeldete Bewertungen prüfen und verwalten</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="p-4 text-center">
            <AlertTriangle size={20} className="mx-auto text-warning mb-1" />
            <div className="text-xl font-bold text-foreground">{pendingReports.length}</div>
            <div className="text-xs text-muted-foreground">Offene Meldungen</div>
          </Card>
          <Card className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto text-primary mb-1" />
            <div className="text-xl font-bold text-foreground">{allReviews.filter((r) => r.status === "published").length}</div>
            <div className="text-xs text-muted-foreground">Veröffentlicht</div>
          </Card>
          <Card className="p-4 text-center">
            <XCircle size={20} className="mx-auto text-destructive mb-1" />
            <div className="text-xl font-bold text-foreground">{dismissed.size}</div>
            <div className="text-xs text-muted-foreground">Bearbeitet</div>
          </Card>
        </div>

        {/* Reported reviews */}
        <h2 className="font-semibold text-foreground text-lg mb-4">Gemeldete Bewertungen</h2>
        {reportedReviews.filter((r) => !dismissed.has(r.id)).length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle size={32} className="mx-auto text-primary mb-2" />
            <p className="text-muted-foreground">Keine offenen Meldungen – alles erledigt!</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {reportedReviews
              .filter((r) => !dismissed.has(r.id))
              .map((review) => {
                const report = pendingReports.find((rep) => rep.review_id === review.id);
                return (
                  <Card key={review.id} className="p-5 border-warning/30">
                    {report && (
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="text-warning border-warning/30">
                          <AlertTriangle size={12} className="mr-1" /> Gemeldet
                        </Badge>
                        <span className="text-xs text-muted-foreground">Grund: {report.reason}</span>
                      </div>
                    )}
                    <ReviewCard review={review} />
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handleApprove(review.id)}>
                        <CheckCircle size={14} /> Freigeben
                      </Button>
                      <Button variant="destructive" size="sm" className="gap-1" onClick={() => handleReject(review.id)}>
                        <XCircle size={14} /> Ablehnen
                      </Button>
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
