import { CompanyKind } from "@prisma/client";

/**
 * German display labels for CompanyKind — the single source of truth.
 * `Landlord.companyType` (the legacy free-text label shown by existing pages) is set from this map
 * for every record created by discovery.
 */
export const COMPANY_KIND_LABELS: Record<CompanyKind, string> = {
  HOUSING_COMPANY: "Wohnungsgesellschaft",
  MUNICIPAL_HOUSING: "Kommunale Wohnungsgesellschaft",
  COOPERATIVE: "Wohnungsgenossenschaft",
  PROPERTY_MANAGER: "Hausverwaltung",
  REAL_ESTATE_COMPANY: "Immobilienunternehmen",
  PRIVATE_LANDLORD: "Privatvermieter",
  UNKNOWN: "Unternehmen",
};

export function companyKindLabel(kind: CompanyKind): string {
  return COMPANY_KIND_LABELS[kind];
}

/**
 * Maps the legacy free-text `companyType` of pre-existing rows to a CompanyKind.
 * Unknown texts map to UNKNOWN — never guess.
 */
export function companyKindFromLegacyLabel(label: string | null | undefined): CompanyKind {
  const folded = (label ?? "").trim().toLowerCase();

  switch (folded) {
    case "wohnungsgesellschaft":
    case "wohnungsunternehmen":
      return CompanyKind.HOUSING_COMPANY;
    case "kommunale wohnungsgesellschaft":
      return CompanyKind.MUNICIPAL_HOUSING;
    case "wohnungsgenossenschaft":
    case "genossenschaft":
      return CompanyKind.COOPERATIVE;
    case "hausverwaltung":
    case "immobilienverwaltung":
      return CompanyKind.PROPERTY_MANAGER;
    case "immobilienunternehmen":
      return CompanyKind.REAL_ESTATE_COMPANY;
    case "privatvermieter":
      return CompanyKind.PRIVATE_LANDLORD;
    default:
      return CompanyKind.UNKNOWN;
  }
}
