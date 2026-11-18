import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toMappedNeighborhoods, toMappedProperties } from "@/data/property-map-data";
import { ObjectMap } from "@/components/ObjectMap";
import { SearchBar } from "@/components/SearchBar";
import { resultRoutes } from "@/features/directory/routes";
import { DirectoryRow } from "@/components/DirectoryRow";
import { Button } from "@/components/ui/button";
import { adaptSearchResults } from "@/features/directory/directory-adapter";
import { searchDirectory } from "@/features/directory/directory-api";
import { DiscoveryPrompt } from "@/components/DiscoveryPrompt";
import { addressSearch, addressUrl } from "@/features/location/api";
import { accuracyLabel, ADDRESS_MIN_LENGTH } from "@/features/location/utils";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const selectedType = ["property", "neighborhood", "landlord"].includes(params.get("type") ?? "") ? params.get("type")! : "all";
  const query = params.get("q") || "";
  const search = useQuery({ queryKey: ["directory-search", query], queryFn: () => searchDirectory(query), retry: 1 });
  const allResults = useMemo(() => search.data ? adaptSearchResults(search.data) : [], [search.data]);
  const results = allResults.filter(item => selectedType === "all" || item.type === selectedType);
  const propertyResults = useMemo(() => search.data ? toMappedProperties(search.data.properties) : [], [search.data]);
  const neighborhoodResults = useMemo(() => search.data ? toMappedNeighborhoods(search.data.neighborhoods) : [], [search.data]);
  // A submitted search text is also resolved as an address. Matches are offered for the address check;
  // nothing is opened automatically, and with several plausible matches the user chooses.
  const addresses = useQuery({ queryKey: ["location-address", query.trim(), false], queryFn: ({ signal }) => addressSearch(query.trim(), false, signal), enabled: query.trim().length >= ADDRESS_MIN_LENGTH && selectedType !== "landlord", staleTime: 300_000, retry: false });
  const addressMatches = addresses.data?.suggestions ?? [];
  const [mapOpen, setMapOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>();
  return <div className="container page-shell">
    <div className="search-page-heading"><h1>{query ? `Ergebnisse für „${query}“` : ({ property: "Immobilien entdecken", neighborhood: "Wohngegenden entdecken", landlord: "Vermieter entdecken", all: "Wohnen aus erster Hand." }[selectedType])}</h1><p className="text-muted-foreground mb-5">Immobilien, Wohngegenden und Vermieter. Erfahre, wie andere das Wohnen erleben.</p><SearchBar large defaultValue={query} scope={selectedType} /></div>
    <div className="category-tabs" role="group" aria-label="Suchergebnisse filtern">{[{ key: "all", label: "Alle" }, { key: "property", label: "Immobilien" }, { key: "neighborhood", label: "Wohngegenden" }, { key: "landlord", label: "Vermieter" }].map(item => <button key={item.key} type="button" aria-pressed={selectedType === item.key} onClick={() => { const next = new URLSearchParams(params); if (item.key === "all") next.delete("type"); else next.set("type", item.key); setParams(next); }}>{item.label}{search.isSuccess && <span className="tab-count">{item.key === "all" ? allResults.length : allResults.filter(result => result.type === item.key).length}</span>}</button>)}</div>
    {addressMatches.length > 0 && <section className="address-matches" aria-labelledby="address-matches-title">
      <h2 id="address-matches-title">{addressMatches.length === 1 ? "Adresse gefunden" : "Mehrere passende Adressen"}</h2>
      <p>{addressMatches.length === 1 ? "Prüfe, was rund um diese Adresse liegt." : "Wähle die passende Adresse, um ihre Umgebung zu prüfen."}</p>
      <ul>{addressMatches.map(address => <li key={address.id}><Link to={addressUrl(address)}><strong>{address.label}</strong><small>Umgebung prüfen · {accuracyLabel(address)}</small></Link></li>)}</ul>
    </section>}
    {search.isLoading ? <p role="status" className="state-message">Verzeichnis wird durchsucht …</p> : search.isError ? <div role="alert" className="state-message"><h2>Die Suche ist gerade nicht verfügbar.</h2><p>Bitte überprüfe deine Verbindung und versuche es erneut.</p><Button variant="outline" className="mt-4" onClick={() => search.refetch()}>Erneut versuchen</Button></div> : results.length === 0 ? <div className="state-message"><h2>Keine Ergebnisse für „{query}“</h2><p>Prüfe die Schreibweise oder suche nach einem Teil des Firmennamens.</p>{search.data?.discoveryEligible && selectedType !== "property" && selectedType !== "neighborhood" && <DiscoveryPrompt query={query} />}</div> : <>
      <p className="result-count" role="status">{results.length} {results.length === 1 ? "Ergebnis" : "Ergebnisse"}</p>
      <div className={mapOpen && selectedType !== "landlord" ? "results-with-map" : "results-only"}>
        <div className="directory-list">{results.map(result => <DirectoryRow key={`${result.type}-${result.id}`} to={resultRoutes[result.type] + result.id} title={result.title} subtitle={`${result.type === "landlord" ? "Vermieter" : result.type === "property" ? "Gebäude" : "Nachbarschaft"} · ${result.subtitle}`} rating={result.rating} reviewCount={result.reviewCount} onFocus={() => { if (result.type === "property") setSelectedPropertyId(result.id); }} />)}</div>
        {selectedType !== "landlord" && (propertyResults.length > 0 || neighborhoodResults.length > 0) && <details className="map-disclosure" onToggle={event => setMapOpen(event.currentTarget.open)}><summary>Karte der Wohnorte anzeigen</summary><ObjectMap properties={selectedType === "neighborhood" ? [] : propertyResults} neighborhoods={selectedType === "property" ? [] : neighborhoodResults} selectedPropertyId={selectedPropertyId} onSelectProperty={setSelectedPropertyId} /></details>}
      </div>
    </>}
  </div>;
}
