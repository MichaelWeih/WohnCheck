import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/auth-context";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { fetchModerationQueue, moderateReview } from "@/features/reviews/review-api";
import { Shield, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();

  const { data: queue, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "moderation-queue"],
    queryFn: () => fetchModerationQueue(accessToken ?? ""),
    enabled: Boolean(accessToken),
  });

  const moderationMutation = useMutation({
    mutationFn: ({
      reviewId,
      action,
    }: {
      reviewId: string;
      action: "publish" | "reject";
    }) => moderateReview(reviewId, action, accessToken ?? ""),
    onSuccess: (_, variables) => {
      toast.success(variables.action === "publish" ? "Bewertung freigegeben." : "Bewertung abgelehnt.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation-queue"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Moderation fehlgeschlagen.";
      toast.error(message);
    },
  });

  const reviews = useMemo(() => (queue ?? []).map(adaptApiReview), [queue]);
  const pendingReports = queue?.flatMap((review) => review.reports.filter((report) => report.status === "PENDING")) ?? [];
  const publishedCount = queue?.filter((review) => review.status === "PUBLISHED").length ?? 0;
  const rejectedCount = reviews.filter((review) => review.status === "rejected").length;

  const handleApprove = (id: string) => {
    moderationMutation.mutate({ reviewId: id, action: "publish" });
  };

  const handleReject = (id: string) => {
    moderationMutation.mutate({ reviewId: id, action: "reject" });
  };

  return (
    <div className="container page-shell">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="p-4 text-center">
            <AlertTriangle size={20} className="mx-auto text-warning mb-1" />
            <div className="text-xl font-bold text-foreground">{pendingReports.length}</div>
            <div className="text-xs text-muted-foreground">Offene Meldungen</div>
          </Card>
          <Card className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto text-primary mb-1" />
            <div className="text-xl font-bold text-foreground">{publishedCount}</div>
            <div className="text-xs text-muted-foreground">Bereits veröffentlicht</div>
          </Card>
          <Card className="p-4 text-center">
            <XCircle size={20} className="mx-auto text-destructive mb-1" />
            <div className="text-xl font-bold text-foreground">{rejectedCount}</div>
            <div className="text-xs text-muted-foreground">Abgelehnt</div>
          </Card>
        </div>

        <h2 className="font-semibold text-foreground text-lg mb-4">Gemeldete Bewertungen</h2>
        {isLoading ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Moderationsliste wird geladen...</p>
          </Card>
        ) : isError ? (<div role="alert" className="state-message"><p>Die Moderationsliste konnte nicht geladen werden.</p><Button variant="outline" onClick={() => refetch()}>Erneut versuchen</Button></div>) : reviews.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle size={32} className="mx-auto text-primary mb-2" />
            <p className="text-muted-foreground">Keine offenen Meldungen - alles erledigt!</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const report = pendingReports.find((entry) => entry.reviewId === review.id);

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
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleApprove(review.id)}
                      disabled={moderationMutation.isPending}
                    >
                      <CheckCircle size={14} /> Freigeben
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleReject(review.id)}
                      disabled={moderationMutation.isPending}
                    >
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
