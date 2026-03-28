import { useState } from "react";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const categories: Record<string, string[]> = {
  landlord: ["Kommunikation", "Fairness", "Reaktionszeit", "Nebenkosten-Transparenz", "Kautionsrückgabe", "Instandhaltung"],
  property: ["Sauberkeit", "Lärm", "Zustand", "Sicherheit", "Gemeinschaft", "Müllsituation"],
  neighborhood: ["Sicherheit", "Ruhe", "Einkaufsmöglichkeiten", "ÖPNV", "Familienfreundlichkeit", "Grünflächen"],
};

const typeLabels: Record<string, string> = {
  landlord: "Vermieter",
  property: "Gebäude / Haus",
  neighborhood: "Nachbarschaft / Stadtteil",
};

export default function WriteReviewPage() {
  const [targetType, setTargetType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const currentCategories = targetType ? categories[targetType] : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetType || !title.trim() || !text.trim() || overallRating === 0) {
      toast.error("Bitte alle Pflichtfelder ausfüllen.");
      return;
    }
    setSubmitted(true);
    toast.success("Bewertung eingereicht!");
  };

  if (submitted) {
    return (
      <div className="container py-20 text-center max-w-lg mx-auto">
        <CheckCircle size={48} className="text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Vielen Dank!</h1>
        <p className="text-muted-foreground">Deine Bewertung wurde eingereicht und wird nach Prüfung veröffentlicht.</p>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">Bewertung abgeben</h1>
        <p className="text-muted-foreground mb-6">Teile deine Wohnerfahrung und hilf anderen Mietern.</p>

        <Card className="p-4 mb-6 border-warning/30 bg-warning/5">
          <div className="flex gap-3">
            <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Hinweis zur Bewertung</p>
              <p>Bewertungen müssen auf eigener Erfahrung basieren. Beleidigende, diskriminierende oder unwahre Inhalte werden entfernt. Mit dem Absenden bestätigst du, dass deine Angaben wahrheitsgemäß sind.</p>
            </div>
          </div>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Was möchtest du bewerten? *</Label>
            <Select onValueChange={(v) => { setTargetType(v); setCategoryRatings({}); }}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Bewertungstyp wählen" /></SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Titel deiner Bewertung *</Label>
            <Input className="mt-1.5" placeholder="z.B. „Guter Vermieter, schnelle Reparaturen"" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
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
                {currentCategories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{cat}</span>
                    <StarRating
                      rating={categoryRatings[cat] || 0}
                      size={20}
                      interactive
                      onChange={(v) => setCategoryRatings((prev) => ({ ...prev, [cat]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Dein Erfahrungsbericht *</Label>
            <Textarea className="mt-1.5" rows={5} placeholder="Beschreibe deine Erfahrung möglichst detailliert..." value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
            <p className="text-xs text-muted-foreground mt-1">{text.length}/2000 Zeichen</p>
          </div>

          <Button type="submit" className="w-full" size="lg">Bewertung absenden</Button>
        </form>
      </div>
    </div>
  );
}
