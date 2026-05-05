export interface ApiScoreComponent {
  id: string;
  scoreResultId: string;
  key: string;
  label: string;
  value: string | number;
  weight?: string | number | null;
  source?: string | null;
  metadata?: {
    details?: string | null;
    sourceName?: string | null;
    sourceUrl?: string | null;
    capturedLabel?: string | null;
  } | null;
}

export interface ApiScoreResult {
  id: string;
  targetType: "LANDLORD" | "PROPERTY" | "NEIGHBORHOOD";
  targetId: string;
  totalScore: string | number;
  confidenceScore?: string | number | null;
  calculationVersion: string;
  computedAt: string;
  components: ApiScoreComponent[];
}
