import { Activity, Database, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiScoreResult } from "@/features/scores/score-types";

type PublicScoreCardProps = {
  score?: ApiScoreResult | null;
  title?: string;
};

const hiddenComponentKeys = new Set(["review_score", "confidence_score"]);

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export function PublicScoreCard({ score, title = "Wohncheck-Score" }: PublicScoreCardProps) {
  if (!score) {
    return null;
  }

  const totalScore = toNumber(score.totalScore);
  const confidenceScore = toNumber(score.confidenceScore);
  const sourceComponents = score.components.filter((component) => !hiddenComponentKeys.has(component.key));

  return (
    <Card className="mb-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Activity size={16} />
            {title}
          </div>
          <h2 className="mt-2 text-3xl font-bold text-foreground">{totalScore.toFixed(0)} / 100</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Datenvertrauen {confidenceScore.toFixed(0)} / 100 · {score.calculationVersion}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
          <Database size={14} />
          Öffentliche Quellen + Nutzerfeedback
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {sourceComponents.map((component) => {
          const value = toNumber(component.value);
          const weight = toNumber(component.weight);

          return (
            <div key={component.id} className="rounded-md border border-border/80 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{component.label}</span>
                <span className="text-sm font-semibold text-foreground">{value.toFixed(0)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(value, 100)}%` }} />
              </div>
              <div className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>
                  {component.metadata?.details ?? component.source ?? "Öffentlicher Datenindikator"}
                  {weight > 0 ? ` · Gewicht ${(weight * 100).toFixed(0)}%` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
