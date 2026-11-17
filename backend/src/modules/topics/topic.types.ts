import { TopicStatementType } from "@prisma/client";

/**
 * CONTRACT of the topic analysis. Only WohnCheck's OWN published reviews are analysed —
 * never third-party content (see docs/vermieter-verzeichnis.md section 7).
 */

export const TOPIC_KEYS = [
  "communication",
  "deposit",
  "utility_costs",
  "rent_increase",
  "repairs",
  "complaints",
  "handover",
  "contract",
] as const;

export type TopicKeyCode = (typeof TOPIC_KEYS)[number];

/** German display labels — single source of truth (the API returns them, the frontend holds no copy). */
export const TOPIC_LABELS: Record<TopicKeyCode, string> = {
  communication: "Kommunikation und Erreichbarkeit",
  deposit: "Kautionsrückzahlung",
  utility_costs: "Nebenkostenabrechnung",
  rent_increase: "Mieterhöhung",
  repairs: "Reparaturen und Instandhaltung",
  complaints: "Umgang mit Beschwerden",
  handover: "Wohnungsübergabe",
  contract: "Vertragsabwicklung",
};

/**
 * Public wording for the statement type. The label describes the TEXT of the review, never the company,
 * and is only ever shown next to a single excerpt (no aggregation by statement type).
 */
export const STATEMENT_TYPE_LABELS: Record<TopicStatementType, string> = {
  EXPERIENCE: "Persönliche Erfahrung",
  FACT_CLAIM: "Konkrete Angabe des Verfassers (von WohnCheck nicht geprüft)",
  ALLEGATION: "Vorwurf des Verfassers (von WohnCheck nicht geprüft)",
};

export interface TopicFinding {
  topic: TopicKeyCode;
  statementType: TopicStatementType;
  /** Literal, complete sentence(s) of the analysed text that triggered the finding; max 300 characters. */
  evidence: string;
}

/**
 * A topic analyzer. The default is rule-based ("rules-v1"): transparent keyword lists, deterministic,
 * no external service. Another analyzer (e.g. an LLM) can be added behind this interface; it would need
 * its own legal check because review texts would leave the system.
 */
export interface TopicAnalyzer {
  /** Id + version, e.g. "rules-v1". Stored in Review.topicsAnalyzer and ReviewTopicTag.analyzer. */
  readonly id: string;
  /** German one-liner describing the method, shown publicly. */
  readonly methodNote: string;
  /** At most one finding per topic. Pure: same text => same findings. */
  analyze(text: string): TopicFinding[];
}

/** Job types owned by the topics module. */
export const TOPIC_JOBS = {
  /**
   * payload: {} — analyses PUBLISHED reviews whose `topicsAnalyzer` differs from the current analyzer id
   * (bounded batch per run, continues via JobContinuation). Local only; registered as a schedule.
   */
  ANALYZE_PENDING: "topics.analyze-pending",
} as const;
