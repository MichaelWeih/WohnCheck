import { Card } from "@/components/ui/card";
import { ExternalLink, Link2 } from "lucide-react";
import type { ExternalListingLink } from "@/features/directory/directory-types";
const listingStatusLabels: Record<ExternalListingLink["status"], string> = {
  "api-ready": "API bereit",
  "credentials-required": "API-Zugang nötig",
  "permission-required": "Freigabe nötig",
  "search-link-only": "Suchlink",
};

export function ExternalListingsPanel({ links }: { links?: ExternalListingLink[] }) {
  const verifiedLinks = links?.filter((link) => link.isVerified && link.listingUrl) ?? [];

  if (verifiedLinks.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8 p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Link2 size={16} />
            Externe Inserate
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Originalanzeigen finden</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            WohnCheck verlinkt zu möglichen Originalinseraten, wenn ein Portal die Adresse auffindbar macht.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {verifiedLinks.map((link) => (
          <a
            key={link.providerKey}
            href={link.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-border p-4 transition-all hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{link.providerName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{listingStatusLabels[link.status]}</p>
              </div>
              <ExternalLink size={17} className="shrink-0 text-muted-foreground group-hover:text-primary" />
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{link.note}</p>
          </a>
        ))}
      </div>
    </Card>
  );
}

