import { useEffect, useState } from "react";
import { LandlordPicker, PickedLandlord } from "@/components/landlord/LandlordPicker";
import { fetchLandlord, fetchNeighborhoods, fetchProperties } from "@/features/directory/directory-api";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-context";
import { createReview } from "@/features/reviews/review-api";
import {
  parseReviewTargetType,
  reviewCategories,
  reviewTypeLabels,
  type ReviewTargetType,
} from "@/features/reviews/review-targets";
import { CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function WriteReviewPageV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessToken, user } = useAuth();

  const initialTargetType = parseReviewTargetType(searchParams.get("targetType"));
  const initialTargetId = searchParams.get("targetId") ?? "";

  const [targetType, setTargetType] = useState<ReviewTargetType | "">(initialTargetType ?? "");
  const [targetId, setTargetId] = useState(initialTargetId);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Buildings and neighbourhoods are few; landlords (1000+) are searched on the server with LandlordPicker.
  const targetsQuery = useQuery({
    queryKey: ["review-targets"],
    queryFn: async () => {
      const [properties, neighborhoods] = await Promise.all([fetchProperties(), fetchNeighborhoods()]);
      return [
        ...properties.map((p) => ({ id: p.id, type: "property" as const, label: `${p.street} ${p.houseNumber}`, subtitle: `${p.postalCode} ${p.city}` })),
        ...neighborhoods.map((n) => ({ id: n.id, type: "neighborhood" as const, label: n.districtName, subtitle: `${n.postalCode} ${n.city}` })),
      ];
    },
  });
  const targets = targetsQuery.data ?? [];
  const [pickedLandlord, setPickedLandlord] = useState<PickedLandlord | null>(null);
  const lockedLandlord = useQuery({
    queryKey: ["landlord", initialTargetId],
    queryFn: () => fetchLandlord(initialTargetId),
    enabled: initialTargetType === "landlord" && Boolean(initialTargetId),
  });
  useEffect(() => {
    if (lockedLandlord.data) setPickedLandlord({ id: lockedLandlord.data.id, label: lockedLandlord.data.name, sublabel: lockedLandlord.data.kindLabel });
  }, [lockedLandlord.data]);
  const currentCategories = targetType ? reviewCategories[targetType] : [];
  const availableTargets = targets.filter(target => target.type === targetType);
  const selectedTarget = availableTargets.find(target => target.id === targetId);
  const targetIsLocked = Boolean(initialTargetType && initialTargetId);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!accessToken || !user) {
      toast.error("Bitte melde dich zuerst an.");
      navigate("/login");
      return;
    }

    if (!targetType || !targetId || !title.trim() || !text.trim() || overallRating === 0) {
      toast.error("Bitte alle Pflichtfelder ausfüllen.");
      return;
    }

    try {
      setIsSubmitting(true);

      await createReview({
        token: accessToken,
        targetType,
        targetId,
        title: title.trim(),
        text: text.trim(),
        overallRating,
        categoryRatings,
      });

      setSubmitted(true);
      toast.success("Bewertung eingereicht!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bewertung konnte nicht gespeichert werden.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container py-20 text-center max-w-lg mx-auto">
        <CheckCircle size={48} className="text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Vielen Dank!</h1>
        <p className="text-muted-foreground">
          Deine Bewertung wurde gespeichert und wird nach Prüfung veröffentlicht.
        </p>
      </div>
    );
  }

  return (
    <div className="container page-shell">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">Bewertung abgeben</h1>
        <p className="text-muted-foreground mb-6">Teile deine Wohnerfahrung und hilf anderen Mietern.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {targetsQuery.isError && <p role="alert" className="text-destructive">Die verfügbaren Wohnorte konnten nicht geladen werden. Bitte lade die Seite erneut.</p>}
          <div>
            <Label htmlFor="target-type">Was möchtest du bewerten? *</Label>
            <Select
              value={targetType}
              onValueChange={(value: ReviewTargetType) => {
                setTargetType(value);
                setTargetId("");
                setCategoryRatings({});
              }}
              disabled={targetIsLocked}
            >
              <SelectTrigger id="target-type" className="mt-1.5">
                <SelectValue placeholder="Bewertungstyp wählen" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(reviewTypeLabels).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            {targetType === "landlord" ? (
              <LandlordPicker
                label="Vermieter *"
                value={pickedLandlord}
                disabled={targetIsLocked}
                onChange={(landlord) => { setPickedLandlord(landlord); setTargetId(landlord?.id ?? ""); }}
              />
            ) : <>
            <Label htmlFor="target">Vermieter oder Wohnort *</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={!targetType || targetIsLocked}>
              <SelectTrigger id="target" className="mt-1.5">
                <SelectValue placeholder={targetType ? "Vermieter oder Wohnort wählen" : "Zuerst Bewertungstyp wählen"} />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.label} - {target.subtitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTarget && (
              <p className="text-xs text-muted-foreground mt-2">
                Ausgewählt: {selectedTarget.label} ({selectedTarget.subtitle})
              </p>
            )}
            </>}
          </div>

          <div>
            <Label htmlFor="review-title">Titel deiner Bewertung *</Label>
            <Input id="review-title" required
              className="mt-1.5"
              placeholder="z.B. Guter Vermieter, schnelle Reparaturen"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
            />
          </div>

          <div>
            <Label>Gesamtbewertung *</Label>
            <div className="mt-2">
              <StarRating rating={overallRating} size={28} interactive onChange={setOverallRating} />
            </div>
          </div>

          {currentCategories.length > 0 && (
            <details className="border-y">
              <summary>Einzelbewertungen (optional)</summary>
              <div className="grid gap-3 mt-2 pb-5">
                {currentCategories.map((category) => (
                  <div key={category} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{category}</span>
                    <StarRating
                      label={category}
                      rating={categoryRatings[category] || 0}
                      size={20}
                      interactive
                      onChange={(value) => setCategoryRatings((prev) => ({ ...prev, [category]: value }))}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          <div>
            <Label htmlFor="review-text">Dein Erfahrungsbericht *</Label>
            <Textarea id="review-text" required
              className="mt-1.5"
              rows={5}
              placeholder="Beschreibe deine Erfahrung möglichst detailliert..."
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1">{text.length}/2000 Zeichen</p>
          </div>

          <details className="text-sm text-muted-foreground border-t"><summary>Hinweise zur Veröffentlichung</summary><p>Beschreibe deine eigene Erfahrung. Beleidigende, diskriminierende oder unwahre Inhalte werden entfernt. Mit dem Absenden bestätigst du, dass deine Angaben wahrheitsgemäß sind. Deine Bewertung wird vor der Veröffentlichung geprüft.</p></details>
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || targetsQuery.isLoading || targetsQuery.isError}>
            {isSubmitting ? "Bewertung wird gespeichert..." : "Bewertung absenden"}
          </Button>
        </form>
      </div>
    </div>
  );
}
