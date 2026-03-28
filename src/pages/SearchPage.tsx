import { useSearchParams, Link } from "react-router-dom";
import { searchAll, SearchResult } from "@/data/mock-data";
import { SearchBar } from "@/components/SearchBar";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Home, MapPin } from "lucide-react";

const typeLabels: Record<string, string> = {
  landlord: "Vermieter",
  property: "Gebäude",
  neighborhood: "Nachbarschaft",
};

const typeIcons: Record<string, typeof Building2> = {
  landlord: Building2,
  property: Home,
  neighborhood: MapPin,
};

const typeRoutes: Record<string, string> = {
  landlord: "/vermieter/",
  property: "/gebaeude/",
  neighborhood: "/nachbarschaft/",
};

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const results = searchAll(q);

  return (
    <div className="container py-10">
      <div className="max-w-3xl mx-auto mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-4">Suchergebnisse{q && ` für „${q}"`}</h1>
        <SearchBar large defaultValue={q} />
      </div>

      {results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">Keine Ergebnisse gefunden.</p>
          <p className="text-sm text-muted-foreground mt-2">Versuche einen anderen Suchbegriff.</p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-3">
          {results.map((r) => {
            const Icon = typeIcons[r.type];
            return (
              <Link to={`${typeRoutes[r.type]}${r.id}`} key={`${r.type}-${r.id}`}>
                <Card className="p-5 hover:shadow-md transition-shadow flex items-center gap-4">
                  <ScoreBadge score={r.rating} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-foreground truncate">{r.title}</h3>
                      <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                        <Icon size={12} /> {typeLabels[r.type]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.subtitle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StarRating rating={r.rating} size={13} />
                      <span className="text-xs text-muted-foreground">{r.reviewCount} Bewertungen</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
