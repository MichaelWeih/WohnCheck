export type ReviewTargetType = "landlord" | "property" | "neighborhood";
export type ReviewTargetTypeApi = "LANDLORD" | "PROPERTY" | "NEIGHBORHOOD";

export type ReviewTargetOption = {
  id: string;
  type: ReviewTargetType;
  label: string;
  subtitle: string;
};

export const reviewCategories: Record<ReviewTargetType, string[]> = {
  // Must match REVIEW_CATEGORIES in backend/src/modules/reviews/reviews.service.ts.
  landlord: [
    "Erreichbarkeit",
    "Kommunikation",
    "Reparaturen und Instandhaltung",
    "Zuverlässigkeit",
    "Nebenkosten-Transparenz",
    "Umgang mit Beschwerden",
    "Fairness",
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
