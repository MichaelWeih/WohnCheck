import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LandlordLogoProps = {
  name: string;
  logoUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-10 w-14",
  md: "h-14 w-20",
  lg: "h-16 w-24",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function LandlordLogo({ name, logoUrl, size = "md", className }: LandlordLogoProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border bg-card p-2",
        sizeClasses[size],
        className,
      )}
      aria-label={`${name} Logo`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={`${name} Logo`} className="max-h-full max-w-full object-contain" loading="lazy" />
      ) : (
        <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Building2 size={size === "sm" ? 14 : 16} />
          <span>{getInitials(name)}</span>
        </div>
      )}
    </div>
  );
}
