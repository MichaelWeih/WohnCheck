import { apiRequest } from "@/lib/api";
import { ApiScoreResult } from "./score-types";

export function fetchScore(targetType: "landlord" | "property" | "neighborhood", targetId: string) {
  return apiRequest<ApiScoreResult | null>(`/scores/${targetType}/${targetId}`, { method: "GET" });
}
