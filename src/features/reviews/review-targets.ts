import { landlords, neighborhoods, properties } from "@/data/mock-data";

export type ReviewTargetType = "landlord" | "property" | "neighborhood";
export type ReviewTargetTypeApi = "LANDLORD" | "PROPERTY" | "NEIGHBORHOOD";

export type ReviewTargetOption = {
  id: string;
  type: ReviewTargetType;
  label: string;
  subtitle: string;
};

export const reviewCategories: Record<ReviewTargetType, string[]> = {
  landlord: [
    "Kommunikation",
    "Fairness",
    "Reaktionszeit",
    "Nebenkosten-Transparenz",
    "Kautionsrückgabe",
    "Instandhaltung",
  ],
  property: [
    "Sauberkeit",
    "Lärm",
    "Zustand",
    "Sicherheit",
    "Gemeinschaft",
    "Müllsituation",
  ],
  neighborhood: [
    "Sicherheit",
    "Ruhe",
    "Einkaufsmöglichkeiten",
    "ÖPNV",
    "Familienfreundlichkeit",
    "Grünflächen",
  ],
};

export const reviewTypeLabels: Record<ReviewTargetType, string> = {
  landlord: "Vermieter",
  property: "Gebäude / Haus",
  neighborhood: "Nachbarschaft / Stadtteil",
};

export const reviewTypeToApiMap: Record<ReviewTargetType, ReviewTargetTypeApi> = {
  landlord: "LANDLORD",
  property: "PROPERTY",
  neighborhood: "NEIGHBORHOOD",
};

export const apiToReviewTypeMap: Record<ReviewTargetTypeApi, ReviewTargetType> = {
  LANDLORD: "landlord",
  PROPERTY: "property",
  NEIGHBORHOOD: "neighborhood",
};

const allTargets: ReviewTargetOption[] = [
  ...landlords.map((landlord) => ({
    id: landlord.id,
    type: "landlord" as const,
    label: landlord.name,
    subtitle: `${landlord.company_type} in ${landlord.city}`,
  })),
  ...properties.map((property) => ({
    id: property.id,
    type: "property" as const,
    label: `${property.street} ${property.house_number}`,
    subtitle: `${property.postal_code} ${property.city}`,
  })),
  ...neighborhoods.map((neighborhood) => ({
    id: neighborhood.id,
    type: "neighborhood" as const,
    label: neighborhood.district_name,
    subtitle: `${neighborhood.postal_code} ${neighborhood.city}`,
  })),
];

export function getTargetsForType(type: ReviewTargetType): ReviewTargetOption[] {
  return allTargets.filter((target) => target.type === type);
}

export function getTargetByTypeAndId(type: ReviewTargetType, id: string) {
  return allTargets.find((target) => target.type === type && target.id === id);
}

export function parseReviewTargetType(value: string | null): ReviewTargetType | null {
  if (!value) {
    return null;
  }

  if (value in apiToReviewTypeMap) {
    return apiToReviewTypeMap[value as ReviewTargetTypeApi];
  }

  if (value === "landlord" || value === "property" || value === "neighborhood") {
    return value;
  }

  return null;
}
