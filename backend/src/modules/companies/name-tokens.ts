/**
 * Classification of the tokens of a normalized company name (see normalization.ts) into
 * GENERIC words and DISTINGUISHING words. Pure data and functions, no I/O.
 *
 * Why: "Wohnungsbaugenossenschaft Berlin" and "Wohnungsbaugenossenschaft Hamburg" share most of their
 * characters but are different companies. Matching (matching.ts) therefore only trusts the words that
 * actually identify a company.
 *
 * - GENERIC: filler words (articles, prepositions, "und", "co") and housing-industry vocabulary
 *   ("wohnungsbau", "genossenschaft", "immobilien", "hausverwaltung", ...), including German compounds
 *   built purely from such vocabulary ("grundstuecksverwaltungsgesellschaft").
 * - DISTINGUISHING: everything else — proper names, place names, abbreviations, and every token that
 *   contains a digit. Numbers are ALWAYS distinguishing ("Objekt 12" is not "Objekt 13").
 *   Place names cannot be recognised without a gazetteer, so they are simply "not generic" and thus
 *   distinguishing, which is the safe side: two names that differ in a place are different companies.
 *
 * Words that usually denote a separate legal entity of a group ("holding", "service", "treuhand",
 * "beteiligung", "management", "projekt", "objekt") are deliberately NOT generic.
 */

/**
 * Generic words that only count as a whole token (never as part of a compound), in folded form
 * (lower case, ae/oe/ue/ss): function words plus adjectives that describe no particular company.
 */
export const GENERIC_FILLER_TOKENS: readonly string[] = [
  // conjunctions, articles, prepositions
  "und", "oder", "sowie", "der", "die", "das", "des", "dem", "den", "ein", "eine", "einer",
  "fuer", "von", "vom", "zu", "zur", "zum", "im", "in", "am", "an", "auf", "aus", "bei", "mit",
  "the", "of", "and", "for",
  // remnants of company suffixes ("& Co.", "Ges.")
  "co", "ges",
  // adjectives without identifying value
  "gemeinnuetzige", "gemeinnuetziger", "gemeinnuetziges", "gemeinnuetzigen",
  "allgemeine", "allgemeiner", "allgemeines", "allgemeinen",
  "deutsche", "deutscher", "deutsches", "deutschen",
  "staedtische", "staedtischer", "staedtisches", "staedtischen",
  "kommunale", "kommunaler", "kommunales", "kommunalen",
  // English industry words
  "real", "estate", "realestate", "property", "properties", "housing",
];

/**
 * Housing-industry word stems in folded form. A token is generic when it is one of these stems or a
 * compound that can be split COMPLETELY into them ("wohnungs" + "bau" + "genossenschaft",
 * "haus" + "verwaltung", "stadt" + "bau"). Inflections and linking forms are listed explicitly
 * ("wohnung", "wohnungs", "wohnungen") instead of being guessed, so that an unrelated word is never
 * matched by accident; a token with any remainder that is not a stem ("auf" + "bau", "spar" + "kasse",
 * "stadt" + "werke") stays distinguishing.
 */
export const GENERIC_INDUSTRY_STEMS: readonly string[] = [
  "wohn", "wohnen", "wohnung", "wohnungs", "wohnungen", "wohnraum", "wohnbau",
  "staette", "staetten",
  "bau", "bauen", "bauten",
  "genossenschaft", "genossenschafts", "genossenschaften",
  "gesellschaft", "gesellschafts", "gesellschaften",
  "verein", "verband",
  "immobilien", "immobilie", "immo",
  "haus", "haeuser", "heim", "heime",
  "verwaltung", "verwaltungs", "verwaltungen",
  "grund", "grundstueck", "grundstuecks", "grundstuecke", "besitz",
  "liegenschaft", "liegenschafts", "liegenschaften",
  "vermietung", "vermietungs", "vermietungen", "miet", "mieten", "mieter",
  "siedlung", "siedlungs", "siedlungen",
  "werk",
  "unternehmen", "unternehmens", "unternehmung", "gruppe",
  "wirtschaft", "wirtschafts",
  "stadt", "kreis", "spar",
];

const FILLER_SET: ReadonlySet<string> = new Set(GENERIC_FILLER_TOKENS);

// Longest stems first: the common case ("wohnungs…") is then found without backtracking.
const STEMS_BY_LENGTH: readonly string[] = [...GENERIC_INDUSTRY_STEMS].sort(
  (left, right) => right.length - left.length || (left < right ? -1 : 1),
);

/** True when `word` consists of one or more industry stems and nothing else. */
function isStemCompound(word: string): boolean {
  if (word === "") return true;

  for (const stem of STEMS_BY_LENGTH) {
    if (word.startsWith(stem) && isStemCompound(word.slice(stem.length))) return true;
  }

  return false;
}

/**
 * True when a token of a normalized name carries no identifying information (see file comment).
 * Tokens containing a digit and single letters (initials) are never generic.
 */
export function isGenericNameToken(token: string): boolean {
  if (token.length < 2) return false;
  if (/\p{N}/u.test(token)) return false;
  if (FILLER_SET.has(token)) return true;

  return isStemCompound(token);
}

/** Splits the tokens of a normalized name into generic and distinguishing ones (order preserved). */
export function splitNameTokens(tokens: readonly string[]): { generic: string[]; distinguishing: string[] } {
  const generic: string[] = [];
  const distinguishing: string[] = [];

  for (const token of tokens) {
    if (token === "") continue;
    (isGenericNameToken(token) ? generic : distinguishing).push(token);
  }

  return { generic, distinguishing };
}

/**
 * True when a name has no distinguishing token at all ("Hausverwaltung", "Deutsche Wohnen").
 * Such names identify nothing on their own; an empty token list counts as generic-only too.
 */
export function hasOnlyGenericTokens(tokens: readonly string[]): boolean {
  return splitNameTokens(tokens).distinguishing.length === 0;
}
