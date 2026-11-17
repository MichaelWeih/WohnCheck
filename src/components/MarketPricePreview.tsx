import { Euro, ExternalLink, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MarketPriceMetric, MarketPricesResponse } from "@/features/directory/directory-types";

type MarketPricePreviewProps = {
  data?: MarketPricesResponse | null;
  className?: string;
};

function formatMetric(metric?: MarketPriceMetric | null) {
  if (!metric || metric.value === null) return "–";

  if (metric.label.toLocaleLowerCase("de-DE").includes("kauf")) {
    return `${Math.round(metric.value).toLocaleString("de-DE")} €/m²`;
  }

  return `${metric.value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m²`;
}

const granularityLabels: Record<MarketPriceMetric["granularity"], string> = {
  "postal-code": "PLZ",
  district: "Stadtteil",
  city: "Stadt",
};

export function MarketPricePreview({ data, className = "" }: MarketPricePreviewProps) {
  if (!data?.available) {
    return null;
  }

  const location = [data.postalCode, data.district, data.city].filter(Boolean).join(", ");

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Euro size={16} />
            Marktpreis-Vorschau
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{location}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Orientierung für Mieten und Kaufpreise pro Quadratmeter.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-64">
          <div className="rounded-lg border bg-background px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Miete</div>
            <div className="text-lg font-bold text-foreground">{formatMetric(data.rent)}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {data.rent?.year} · {data.rent ? granularityLabels[data.rent.granularity] : "–"}
            </div>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Kauf</div>
            <div className="text-lg font-bold text-foreground">{formatMetric(data.purchase)}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {data.purchase?.year} · {data.purchase ? granularityLabels[data.purchase.granularity] : "–"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0 text-primary" />
        <p>{data.note}</p>
      </div>

      {data.sources.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.sources.map((source) => (
            <a
              key={source.key}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              title={source.note}
            >
              {source.name}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
