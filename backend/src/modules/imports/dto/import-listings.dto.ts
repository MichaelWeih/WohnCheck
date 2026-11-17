import { ListingSourceMethod, ProviderKind } from "@prisma/client";

export class ImportListingsDto {
  sourceKey?: string;
  sourceName?: string;
  providerKind?: ProviderKind;
  method?: ListingSourceMethod;
  csv?: string;
  records?: Record<string, unknown>[];
}
