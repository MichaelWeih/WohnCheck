import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  /** Average rating; `null` means "no reviews yet" and is never rendered as 0. */
  score: number | null;
  size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number) {
  if (score >= 4) return "bg-primary text-primary-foreground";
  if (score >= 3) return "bg-warning text-accent-foreground";
  return "bg-destructive text-destructive-foreground";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const sizeClasses = {
    sm: "w-9 h-9 text-sm",
    md: "w-12 h-12 text-lg",
    lg: "w-16 h-16 text-2xl",
  };

  if (score === null) {
    return (
      <div
        className={cn(
          "rounded-lg font-bold flex items-center justify-center shrink-0 bg-muted text-muted-foreground",
          sizeClasses[size],
        )}
        title="Noch keine Bewertungen"
        aria-label="Noch keine Bewertungen"
      >
        –
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-lg font-bold flex items-center justify-center shrink-0", getScoreColor(score), sizeClasses[size])}
      aria-label={`Bewertung ${score.toFixed(1)} von 5`}
    >
      {score.toFixed(1)}
    </div>
  );
}
