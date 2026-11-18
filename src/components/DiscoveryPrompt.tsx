import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DirectoryRow } from "@/components/DirectoryRow";
import type { DiscoveryRequestResponse } from "@/features/api-types";
import { fetchDiscoveryRequest, requestDiscovery } from "@/features/directory/directory-api";
import { landlordSubtitle } from "@/features/directory/directory-adapter";

/**
 * Search-on-miss: offered as a button when a company name was not found. The term is sent to Wikidata and
 * GLEIF only after the click; found companies are added to the directory, uncertain ones are reviewed first.
 */
export function DiscoveryPrompt({ query }: { query: string }) {
  const [state, setState] = useState<DiscoveryRequestResponse | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    setState(null);
    setError("");
  }, [query]);

  const poll = useQuery({
    queryKey: ["discovery-request", state?.id],
    queryFn: () => fetchDiscoveryRequest(state!.id!),
    enabled: Boolean(state?.id && state.pollAfterMs),
    refetchInterval: (q) => q.state.data?.pollAfterMs ?? false,
  });
  const current = poll.data ?? state;

  async function start() {
    setStarting(true);
    setError("");
    try {
      setState(await requestDiscovery(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Suche konnte nicht gestartet werden.");
    } finally {
      setStarting(false);
    }
  }

  if (!current)
    return (
      <section className="discovery-prompt" aria-labelledby="discovery-title">
        <h2 id="discovery-title">Unternehmen nicht gefunden?</h2>
        <p>
          WohnCheck kann in den offenen Unternehmensverzeichnissen Wikidata und GLEIF nach „{query}“ suchen. Dabei wird nur der
          Suchbegriff übermittelt. Gefundene Unternehmen werden ins Verzeichnis aufgenommen, unsichere Treffer erst nach einer Prüfung.
        </p>
        <Button variant="outline" onClick={start} disabled={starting}>
          {starting ? "Suche wird gestartet …" : "In offenen Quellen suchen"}
        </Button>
        {error && <p role="alert" className="form-error">{error}</p>}
      </section>
    );

  return (
    <section className="discovery-prompt" aria-live="polite">
      <p role="status">{current.message}</p>
      {current.landlords.length > 0 && (
        <div className="directory-list">
          {current.landlords.map((landlord) => (
            <DirectoryRow
              key={landlord.id}
              to={`/vermieter/${landlord.id}`}
              title={landlord.name}
              subtitle={landlordSubtitle(landlord)}
              rating={landlord.ratingOverall}
              reviewCount={landlord.reviewCount}
            />
          ))}
        </div>
      )}
    </section>
  );
}
