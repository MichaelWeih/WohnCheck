import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, ExternalLink, Home, MapPin } from "lucide-react";
import { fetchListing } from "@/features/directory/directory-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ListingDetail = {
  id: string;
  title: string;
  address: string;
  city: string;
  districtName?: string | null;
  livingAreaSqm?: number | null;
  rooms?: number | null;
  coldRent?: number | null;
  warmRent?: number | null;
  pricePerSqm?: number | null;
  districtMedianPricePerSqm?: number | null;
  priceDeviationPercent?: number | null;
  dataQualityScore: number;
  scorePreview?: number | null;
  landlord?: { id: string; name: string; providerKind: string } | null;
  sourceProvider?: { name: string; legalUseStatus: string; qualityScore?: number | null } | null;
  externalLinks?: Array<{ label: string; url: string; type: string }>;
};

export default function ListingDetailPage() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListing(id ?? "") as Promise<ListingDetail>,
    enabled: Boolean(id),
  });

  if (isLoading) {
    return <div className="container py-20 text-center text-muted-foreground">Angebot wird geladen...</div>;
  }

  if (!data) {
    return <div className="container py-20 text-center text-muted-foreground">Angebot nicht gefunden.</div>;
  }

  const deviation = data.priceDeviationPercent;
  const deviationText = deviation === null || deviation === undefined
    ? "Noch kein Stadtteilvergleich möglich"
    : deviation > 0
      ? `${Math.abs(deviation).toFixed(0)} % über Stadtteildurchschnitt`
      : `${Math.abs(deviation).toFixed(0)} % günstiger als der Stadtteildurchschnitt`;

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-4xl">
        <Button asChild variant="ghost" className="mb-4">
          <Link to="/suche">
            <ArrowLeft size={16} /> Zurück
          </Link>
        </Button>

        <Card className="mb-6 p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Home size={16} />
                Freie Mietwohnung
              </div>
              <h1 className="text-3xl font-bold text-foreground">{data.title}</h1>
              <p className="mt-2 flex items-center gap-1 text-muted-foreground">
                <MapPin size={16} />
                {data.address}
              </p>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3 text-center">
              <div className="text-xs text-muted-foreground">WohnCheck-Vorschau</div>
              <div className="text-2xl font-bold text-foreground">{data.scorePreview ?? "–"}</div>
            </div>
          </div>
        </Card>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Kaltmiete</div>
            <div className="mt-1 text-xl font-bold">{data.coldRent ? `${data.coldRent.toFixed(0)} €` : "–"}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Quadratmeterpreis</div>
            <div className="mt-1 text-xl font-bold">{data.pricePerSqm ? `${data.pricePerSqm.toFixed(2)} €/m²` : "–"}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Wohnfläche</div>
            <div className="mt-1 text-xl font-bold">{data.livingAreaSqm ? `${data.livingAreaSqm} m²` : "–"}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Zimmer</div>
            <div className="mt-1 text-xl font-bold">{data.rooms ?? "–"}</div>
          </Card>
        </div>

        <Card className="mb-6 p-6">
          <h2 className="font-semibold text-foreground">Preisvergleich</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {deviationText}
            {data.districtMedianPricePerSqm ? ` · Stadtteilmedian ${data.districtMedianPricePerSqm.toFixed(2)} €/m²` : ""}
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-foreground">Quelle und Vermieter</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Quelle: {data.sourceProvider?.name ?? "WohnCheck"} · Datenqualität {data.dataQualityScore} %
            </div>
            <div className="flex flex-wrap gap-2">
              {data.landlord && (
                <Button asChild variant="outline">
                  <Link to={`/vermieter/${data.landlord.id}`}>
                    <Building2 size={16} /> Vermieterprofil
                  </Link>
                </Button>
              )}
              {data.externalLinks?.map((link) => (
                <Button key={link.url} asChild variant="outline">
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} /> {link.label}
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
