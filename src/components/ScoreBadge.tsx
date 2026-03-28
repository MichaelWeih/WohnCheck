import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
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

  return (
    <div className={cn("rounded-lg font-bold flex items-center justify-center", getScoreColor(score), sizeClasses[size])}>
      {score.toFixed(1)}
    </div>
  );
}
