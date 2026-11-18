import { IdentifierScheme } from "@prisma/client";
import { LegalFormCode, MatchDecision } from "./company.types";
import { hasOnlyGenericTokens, splitNameTokens } from "./name-tokens";
import { normalizeSearchText } from "./normalization";

/**
 * Pairwise decision whether two company descriptions denote the same legal entity
 * (docs/vermieter-verzeichnis.md section 3.2). Pure, no I/O.
 *
 * "same" may be linked automatically; "candidate" only ever goes to manual review; fuzzy similarity alone
 * never produces "same".
 */
export interface MatchSubject {
  /** kind "primary" = display name, "legal" = registered name, "alias" = any other alias. */
  names: Array<{ normalized: string; legalForm: LegalFormCode | null; kind: "primary" | "legal" | "alias" }>;
  /** Canonical identifiers. */
  identifiers: Array<{ scheme: IdentifierScheme; value: string }>;
  websiteDomain: string | null;
  postalCode: string | null;
  city: string | null;
}

export interface MatchResult {
  decision: MatchDecision;
  /** 0..1, only for ordering candidates. */
  score: number;
  reasons: string[];
}

const RANK: Record<MatchDecision, number> = { different: 0, candidate: 1, same: 2 };

function ids(subject: MatchSubject, scheme: IdentifierScheme): Set<string> {
  return new Set(subject.identifiers.filter((id) => id.scheme === scheme).map((id) => id.value));
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/** Legal forms are compatible when equal or when one side is unknown. */
function formsCompatible(a: LegalFormCode | null, b: LegalFormCode | null): boolean {
  return a === null || b === null || a === b;
}

function tokensOf(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  const union = left.size + right.size - shared;
  return union ? shared / union : 0;
}

type NameEntry = MatchSubject["names"][number];

/** Rule 4 for one pair of names. */
function compareNames(
  x: NameEntry,
  y: NameEntry,
  a: MatchSubject,
  b: MatchSubject,
): { decision: MatchDecision; reason: string } {
  if (!x.normalized || !y.normalized) return { decision: "different", reason: "empty_name" };
  const xTokens = tokensOf(x.normalized);
  const yTokens = tokensOf(y.normalized);
  const xDist = new Set(splitNameTokens(xTokens).distinguishing);
  const yDist = new Set(splitNameTokens(yTokens).distinguishing);
  const onlyX = [...xDist].filter((token) => !yDist.has(token));
  const onlyY = [...yDist].filter((token) => !xDist.has(token));

  if (onlyX.length && onlyY.length) return { decision: "different", reason: "distinguishing_words_differ" };

  const compatible = formsCompatible(x.legalForm, y.legalForm);
  const sameDomain = !!a.websiteDomain && a.websiteDomain === b.websiteDomain;

  if (x.normalized === y.normalized) {
    if (!compatible) return { decision: "candidate", reason: "same_name_different_legal_form" };
    if (sameDomain) return { decision: "same", reason: "same_name+domain" };
    const samePostal = !!a.postalCode && a.postalCode === b.postalCode;
    const bothFormsKnown = x.legalForm !== null && x.legalForm === y.legalForm;
    const specific =
      !hasOnlyGenericTokens(xTokens) && (xTokens.length >= 2 || x.normalized.replace(/\s/g, "").length >= 5);
    if (samePostal && bothFormsKnown && specific)
      return { decision: "same", reason: "same_name+postal_code+legal_form" };
    return { decision: "candidate", reason: "same_name" };
  }

  // One side's distinguishing words are a subset of the other's.
  const surplus = onlyX.length ? onlyX : onlyY;
  const longerIsX = onlyX.length > 0;
  const otherCity = normalizeSearchText((longerIsX ? b.city : a.city) ?? "");
  const extraIsCity = surplus.every((token) => otherCity.split(" ").includes(token));
  const shorterDistinguishing = longerIsX ? yDist.size : xDist.size;
  // A name of industry words only ("Wohnungsbaugesellschaft") identifies nothing: it is a subset of every name,
  // so it may only match when the surplus is exactly the other side's seat ("Stadtbau" + Würzburg).
  if (shorterDistinguishing === 0 && surplus.length > 0 && !extraIsCity)
    return { decision: "different", reason: "generic_name" };
  if (surplus.length === 0 || extraIsCity) {
    if (!compatible) return { decision: "candidate", reason: "similar_name_different_legal_form" };
    return { decision: "candidate", reason: surplus.length ? "name_plus_city" : "name_plus_generic_words" };
  }
  if (x.legalForm && y.legalForm && x.legalForm !== y.legalForm)
    return { decision: "different", reason: "extra_words_and_different_legal_form" };
  return { decision: "candidate", reason: "name_contains_other" };
}

/** Best rule-4 decision over all name pairs; aliases can at most justify "candidate". */
function compareAllNames(a: MatchSubject, b: MatchSubject): { decision: MatchDecision; reasons: string[] } {
  let best: { decision: MatchDecision; reasons: string[] } = { decision: "different", reasons: ["no_name_match"] };
  for (const x of a.names) {
    for (const y of b.names) {
      const result = compareNames(x, y, a, b);
      let decision = result.decision;
      if ((x.kind === "alias" || y.kind === "alias") && decision === "same") decision = "candidate";
      if (RANK[decision] > RANK[best.decision]) best = { decision, reasons: [result.reason + (decision !== result.decision ? ":alias" : "")] };
      if (best.decision === "same") return best;
    }
  }
  return best;
}

function nameScore(a: MatchSubject, b: MatchSubject): number {
  let best = 0;
  for (const x of a.names)
    for (const y of b.names) best = Math.max(best, jaccard(tokensOf(x.normalized), tokensOf(y.normalized)));
  return best;
}

export function scoreCompanyMatch(a: MatchSubject, b: MatchSubject): MatchResult {
  const leiA = ids(a, IdentifierScheme.LEI);
  const leiB = ids(b, IdentifierScheme.LEI);
  // Rule 0: different LEIs can never be the same entity.
  if (leiA.size && leiB.size && !intersects(leiA, leiB))
    return { decision: "different", score: 0, reasons: ["different_lei"] };
  // Rule 1: official identifiers.
  if (intersects(leiA, leiB)) return { decision: "same", score: 1, reasons: ["same_lei"] };
  const regA = ids(a, IdentifierScheme.GERMAN_REGISTER);
  const regB = ids(b, IdentifierScheme.GERMAN_REGISTER);
  if (intersects(regA, regB)) return { decision: "same", score: 1, reasons: ["same_register"] };

  // Rule 2: a shared Wikidata QID needs an identical core name as well.
  const qidA = ids(a, IdentifierScheme.WIKIDATA);
  const qidB = ids(b, IdentifierScheme.WIKIDATA);
  if (intersects(qidA, qidB)) {
    const primaryOrLegal = (s: MatchSubject) => s.names.filter((n) => n.kind !== "alias" && n.normalized);
    const identical =
      primaryOrLegal(a).some((x) => primaryOrLegal(b).some((y) => x.normalized === y.normalized)) ||
      a.names.some((x) => x.kind === "primary" && b.names.some((y) => y.normalized === x.normalized)) ||
      b.names.some((y) => y.kind === "primary" && a.names.some((x) => x.normalized === y.normalized));
    return identical
      ? { decision: "same", score: 1, reasons: ["same_qid+same_name"] }
      : { decision: "candidate", score: 0.9, reasons: ["shared_qid"] };
  }

  const names = compareAllNames(a, b);
  const score = names.decision === "same" ? 1 : names.decision === "candidate" ? 0.3 + 0.6 * nameScore(a, b) : 0;

  // Rule 3: conflicting official identifiers are never silently "same".
  const conflicting = (regA.size && regB.size) || (qidA.size && qidB.size);
  if (conflicting)
    return names.decision === "different"
      ? { decision: "different", score: 0, reasons: ["identifier_conflict", ...names.reasons] }
      : { decision: "candidate", score, reasons: ["identifier_conflict", ...names.reasons] };

  return { decision: names.decision, score, reasons: names.reasons };
}
