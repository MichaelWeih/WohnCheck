import { useQuery } from "@tanstack/react-query";
import { MarketPricePreview } from "@/components/MarketPricePreview";
import { ExternalListingsPanel } from "@/components/ExternalListingsPanel";
import { fetchMarketPrices, fetchExternalListingLinks } from "@/features/directory/directory-api";
import type { ApiProperty } from "@/features/directory/directory-types";
export function PropertySourcePanels({ property }: { property: Pick<ApiProperty, "id" | "street" | "houseNumber" | "postalCode" | "city"> }) {
  const prices = useQuery({ queryKey: ["market-prices", property.city, property.postalCode], queryFn: () => fetchMarketPrices({ city: property.city, postalCode: property.postalCode }), staleTime: 3_600_000, retry: 1 });
  const links = useQuery({ queryKey: ["external-listing-links", property.id], queryFn: () => fetchExternalListingLinks(property), staleTime: 1_800_000, retry: 1 });
  return <details className="mb-6"><summary>Marktpreise und externe Inserate</summary>
    {(prices.isLoading || links.isLoading) && <p role="status">Quelldaten werden geladen …</p>}
    {(prices.isError || links.isError) && <p role="alert">Einige Quelldaten sind momentan nicht verfügbar.</p>}
    <MarketPricePreview data={prices.data} className="mb-6" /><ExternalListingsPanel links={links.data?.links} />
  </details>;
}
