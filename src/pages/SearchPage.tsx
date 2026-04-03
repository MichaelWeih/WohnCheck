import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMappedNeighborhoods, getMappedProperties } from "@/data/property-map-data";
import { PropertyMap } from "@/components/PropertyMap";
import { SearchBar } from "@/components/SearchBar";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adaptSearchResults } from "@/features/directory/directory-adapter";
import { searchDirectory } from "@/features/directory/directory-api";
import { searchAll } from "@/data/mock-data";
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
  const query = params.get("q") || "";
  const { data: apiResults } = useQuery({
    queryKey: ["directory-search", query],
    queryFn: () => searchDirectory(query),
    enabled: Boolean(query.trim()),
  });

  const fallbackResults = useMemo(() => searchAll(query), [query]);
  const results = apiResults ? adaptSearchResults(apiResults) : fallbackResults;

  const propertyResults = getMappedProperties().filter((property) =>
    results.some((result) => result.type === "property" && result.id === property.id),
  );
  const neighborhoodResults = getMappedNeighborhoods().filter((neighborhood) =>
    results.some((result) => result.type === "neighborhood" && result.id === neighborhood.id),
  );
  const propertyResultIds = propertyResults.map((property) => property.id).join("|");
  const firstPropertyId = propertyResults[0]?.id;
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(firstPropertyId);

  useEffect(() => {
    setSelectedPropertyId((currentPropertyId) => {
      if (currentPropertyId && propertyResults.some((property) => property.id === currentPropertyId)) {
        return currentPropertyId;
      }

      return firstPropertyId;
    });
  }, [firstPropertyId, propertyResultIds, propertyResults]);

  return (
    <div className="container py-10">
      <div className="max-w-3xl mx-auto mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-4">Suchergebnisse{query && ` für "${query}"`}</h1>
        <SearchBar large defaultValue={query} />
      </div>

      {results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">Keine Ergebnisse gefunden.</p>
          <p className="text-sm text-muted-foreground mt-2">Versuche einen anderen Suchbegriff.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <div className="max-w-3xl space-y-3 xl:max-w-none">
            {results.map((result) => {
              const Icon = typeIcons[result.type];
              const isSelectedProperty = result.type === "property" && result.id === selectedPropertyId;

              return (
                <Link
                  to={`${typeRoutes[result.type]}${result.id}`}
                  key={`${result.type}-${result.id}`}
                  onMouseEnter={() => result.type === "property" && setSelectedPropertyId(result.id)}
                >
                  <Card
                    className={`flex items-center gap-4 p-5 transition-all hover:shadow-md ${
                      isSelectedProperty ? "border-primary shadow-md ring-1 ring-primary/20" : ""
                    }`}
                  >
                    <ScoreBadge score={result.rating} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-foreground truncate">{result.title}</h3>
                        <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                          <Icon size={12} /> {typeLabels[result.type]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{result.subtitle}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <StarRating rating={result.rating} size={13} />
                        <span className="text-xs text-muted-foreground">{result.reviewCount} Bewertungen</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {(propertyResults.length > 0 || neighborhoodResults.length > 0) && (
            <div className="xl:sticky xl:top-24">
              <PropertyMap
                properties={propertyResults}
                neighborhoods={neighborhoodResults}
                selectedPropertyId={selectedPropertyId}
                onSelectProperty={setSelectedPropertyId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
