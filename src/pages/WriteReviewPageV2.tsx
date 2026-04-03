import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-context";
import { createReview } from "@/features/reviews/review-api";
import {
  getTargetByTypeAndId,
  getTargetsForType,
  parseReviewTargetType,
  reviewCategories,
  reviewTypeLabels,
  type ReviewTargetType,
} from "@/features/reviews/review-targets";
import { AlertTriangle, CheckCircle } from "lucide-react";
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

  const currentCategories = targetType ? reviewCategories[targetType] : [];
  const availableTargets = targetType ? getTargetsForType(targetType) : [];
  const selectedTarget = targetType && targetId ? getTargetByTypeAndId(targetType, targetId) : null;
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
    <div className="container py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">Bewertung abgeben</h1>
        <p className="text-muted-foreground mb-6">Teile deine Wohnerfahrung und hilf anderen Mietern.</p>

        {user && (
          <Card className="p-4 mb-6 bg-muted/40">
            <p className="text-sm text-muted-foreground">
              Eingeloggt als <span className="font-medium text-foreground">{user.displayName}</span> ({user.role})
            </p>
          </Card>
        )}

        <Card className="p-4 mb-6 border-warning/30 bg-warning/5">
          <div className="flex gap-3">
            <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Hinweis zur Bewertung</p>
              <p>
                Bewertungen müssen auf eigener Erfahrung basieren. Beleidigende, diskriminierende oder unwahre Inhalte
                werden entfernt. Mit dem Absenden bestätigst du, dass deine Angaben wahrheitsgemäß sind.
              </p>
            </div>
          </div>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Was möchtest du bewerten? *</Label>
            <Select
              value={targetType}
              onValueChange={(value: ReviewTargetType) => {
                setTargetType(value);
                setTargetId("");
                setCategoryRatings({});
              }}
              disabled={targetIsLocked}
            >
              <SelectTrigger className="mt-1.5">
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
            <Label>Zielobjekt *</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={!targetType || targetIsLocked}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={targetType ? "Zielobjekt wählen" : "Zuerst Bewertungstyp wählen"} />
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
          </div>

          <div>
            <Label>Titel deiner Bewertung *</Label>
            <Input
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
            <div>
              <Label>Einzelbewertungen</Label>
              <div className="grid gap-3 mt-2">
                {currentCategories.map((category) => (
                  <div key={category} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{category}</span>
                    <StarRating
                      rating={categoryRatings[category] || 0}
                      size={20}
                      interactive
                      onChange={(value) => setCategoryRatings((prev) => ({ ...prev, [category]: value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Dein Erfahrungsbericht *</Label>
            <Textarea
              className="mt-1.5"
              rows={5}
              placeholder="Beschreibe deine Erfahrung möglichst detailliert..."
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1">{text.length}/2000 Zeichen</p>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Bewertung wird gespeichert..." : "Bewertung absenden"}
          </Button>
        </form>
      </div>
    </div>
  );
}
