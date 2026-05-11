import { useEffect, useRef, useState } from "react";
import { Building2, Home, Loader2, Map, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { fetchAddressSuggestions, searchDirectory } from "@/features/directory/directory-api";
import type { AddressSuggestion } from "@/features/directory/directory-types";
import { adaptSearchResults } from "@/features/directory/directory-adapter";
import type { SearchResult } from "@/data/mock-data";

interface SearchBarProps {
  large?: boolean;
  defaultValue?: string;
}

type SearchSuggestion =
  | {
      kind: "address";
      id: string;
      title: string;
      subtitle: string;
      address: AddressSuggestion;
    }
  | {
      kind: SearchResult["type"];
      id: string;
      title: string;
      subtitle: string;
      href: string;
    };

const suggestionIcons = {
  address: MapPin,
  landlord: Building2,
  property: Home,
  neighborhood: Map,
};

const suggestionLabels = {
  address: "Adresse",
  landlord: "Vermieter",
  property: "Gebäude",
  neighborhood: "Nachbarschaft",
};

export function SearchBar({ large = false, defaultValue = "" }: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [shouldSuggest, setShouldSuggest] = useState(false);
  const requestIdRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    setQuery(defaultValue);
    setShouldSuggest(false);
    setIsSuggestionOpen(false);
    setSuggestions([]);
    requestIdRef.current += 1;
  }, [defaultValue]);

  const closeSuggestions = () => {
    setShouldSuggest(false);
    setIsSuggestionOpen(false);
    setSuggestions([]);
    requestIdRef.current += 1;
  };

  const handleSearch = () => {
    const trimmedQuery = query.trim();

    closeSuggestions();

    if (trimmedQuery) navigate(`/suche?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const handleSuggestionSelect = (suggestion: AddressSuggestion) => {
    const params = new URLSearchParams({
      q: suggestion.shortLabel,
      lat: String(suggestion.latitude),
      lon: String(suggestion.longitude),
      address: suggestion.label,
    });

    if (suggestion.city) params.set("city", suggestion.city);
    if (suggestion.district) params.set("district", suggestion.district);
    if (suggestion.postalCode) params.set("postalCode", suggestion.postalCode);

    setQuery(suggestion.shortLabel);
    closeSuggestions();
    navigate(`/suche?${params.toString()}`);
  };

  const handleDirectorySuggestionSelect = (suggestion: Extract<SearchSuggestion, { href: string }>) => {
    setQuery(suggestion.title);
    closeSuggestions();
    navigate(suggestion.href);
  };

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!shouldSuggest || trimmedQuery.length < 3) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsSuggesting(true);

    const timeout = window.setTimeout(() => {
      Promise.allSettled([
        fetchAddressSuggestions(trimmedQuery),
        searchDirectory(trimmedQuery),
      ])
        .then(([addressResult, directoryResult]) => {
          if (requestIdRef.current !== requestId) return;

          const addressSuggestions: SearchSuggestion[] =
            addressResult.status === "fulfilled"
              ? addressResult.value.suggestions.slice(0, 5).map((suggestion) => ({
                  kind: "address" as const,
                  id: `address-${suggestion.id}`,
                  title: suggestion.shortLabel,
                  subtitle: [suggestion.district, suggestion.city].filter(Boolean).join(" · ") || suggestion.label,
                  address: suggestion,
                }))
              : [];
          const directorySuggestions: SearchSuggestion[] =
            directoryResult.status === "fulfilled"
              ? adaptSearchResults(directoryResult.value).slice(0, 6).map((result) => ({
                  kind: result.type,
                  id: `directory-${result.type}-${result.id}`,
                  title: result.title,
                  subtitle: result.subtitle,
                  href:
                    result.type === "landlord"
                      ? `/vermieter/${encodeURIComponent(result.id)}${result.sourceCandidate ? `?city=${encodeURIComponent(result.city)}` : ""}`
                      : result.type === "property"
                        ? `/gebaeude/${result.id}`
                        : `/nachbarschaft/${result.id}`,
                }))
              : [];
          const nextSuggestions = [...directorySuggestions, ...addressSuggestions].slice(0, 8);

          setSuggestions(nextSuggestions);
          setIsSuggestionOpen(nextSuggestions.length > 0);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setSuggestions([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsSuggesting(false);
          }
        });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [query, shouldSuggest]);

  return (
    <div className={`relative flex w-full gap-2 ${large ? "max-w-2xl" : "max-w-md"}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={large ? 20 : 18} />
        <Input
          placeholder="Adresse, Vermieter, Stadtteil oder PLZ..."
          className={`pl-10 ${large ? "h-12 text-base" : "h-10"}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShouldSuggest(true);
            setIsSuggestionOpen(true);
          }}
          onFocus={() => {
            setShouldSuggest(true);
            if (suggestions.length > 0) setIsSuggestionOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsSuggestionOpen(false);
              return;
            }

            if (e.key === "Enter") handleSearch();
          }}
        />
        {isSuggesting && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            size={large ? 18 : 16}
          />
        )}
      </div>
      <Button onClick={handleSearch} className={large ? "h-12 px-8" : ""}>
        Suchen
      </Button>
      {isSuggestionOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          <div className="max-h-80 overflow-y-auto py-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  suggestion.kind === "address"
                    ? handleSuggestionSelect(suggestion.address)
                    : handleDirectorySuggestionSelect(suggestion)
                }
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-secondary"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {(() => {
                    const Icon = suggestionIcons[suggestion.kind];
                    return <Icon size={16} />;
                  })()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{suggestion.title}</span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                    {suggestionLabels[suggestion.kind]} · {suggestion.subtitle}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Adressdaten: OpenStreetMap · Verzeichnis: WohnCheck und öffentliche Quellen
          </div>
        </div>
      )}
    </div>
  );
}
