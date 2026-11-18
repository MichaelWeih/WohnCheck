import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { fetchLandlordExternal } from "@/features/directory/directory-api";

/**
 * Experiences on other platforms — links only. No external rating, count or text is shown or mixed into the
 * WohnCheck rating; the platforms' terms do not allow it without a contract.
 */
export function ExternalExperiences({ landlordId }: { landlordId: string }) {
  const query = useQuery({ queryKey: ["landlord-external", landlordId], queryFn: () => fetchLandlordExternal(landlordId), staleTime: 300_000 });
  if (query.isLoading) return <p role="status">Externe Hinweise werden geladen …</p>;
  if (query.isError || !query.data) return <p>Externe Hinweise sind gerade nicht verfügbar.</p>;
  const data = query.data;
  return (
    <div className="external-experiences">
      <p className="field-hint">{data.disclaimer}</p>
      <ul>
        {data.platforms.map((platform) => (
          <li key={platform.platform}>
            <strong>{platform.displayName}</strong>
            {platform.references.map((ref) => (
              <a key={ref.id} href={ref.url} target="_blank" rel="noopener noreferrer nofollow" className="text-link">
                {ref.label} <ArrowUpRight size={14} aria-hidden="true" />
                {ref.matchHint && <span className="relation-meta"> ({ref.matchHint})</span>}
                <span className="sr-only"> (neuer Tab)</span>
              </a>
            ))}
            {platform.searchLinks.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="text-link">
                {link.label} <ArrowUpRight size={14} aria-hidden="true" />
                <span className="sr-only"> (neuer Tab)</span>
              </a>
            ))}
          </li>
        ))}
      </ul>
      {data.helpLinks.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="text-link">
          {link.label} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
