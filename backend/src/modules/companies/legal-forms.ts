import { LegalFormCode } from "./company.types";

/**
 * Recognition of German legal forms inside a company name. Pure functions, no I/O.
 *
 * Input is always FOLDED text (lower case, umlauts transliterated, punctuation still present — see
 * `foldText` in normalization.ts); "&" must not have been rewritten yet, because "GmbH & Co. KG" is
 * one legal form.
 *
 * THE RULE (documented here once, tested in normalization.spec.ts):
 *
 * 1. Unambiguous expressions are a legal form wherever they stand as a separate word or phrase:
 *    "GmbH", "gGmbH", "mbH", "Gesellschaft mit beschränkter Haftung", "GmbH & Co. KG" and the other
 *    "& Co." combinations, "UG (haftungsbeschränkt)", "Aktiengesellschaft" (also as the END of a word:
 *    "Wohnungsbau-Aktiengesellschaft", "Immobilienaktiengesellschaft"), "KGaA", "Kommanditgesellschaft",
 *    "OHG", "eingetragene Genossenschaft", "eingetragener Verein", "AöR", "KdöR", "GbR", "PartG",
 *    "e.Kfm.", "Inh." and so on. A combination is one unit, so the most specific form wins
 *    ("GmbH & Co. KG" is GMBH_CO_KG, never GMBH or KG).
 *
 * 2. The short forms "AG", "SE", "eG", "KG", "UG", "e.V.", "e.K." (with or without dots) are AMBIGUOUS:
 *    the same letters occur as initials, abbreviations ("AG" = Arbeitsgemeinschaft) or name parts.
 *    They are never recognised inside a word. As a separate token they are a legal form only if
 *    a) at least one word precedes them ("Vonovia SE", "Bau AG Leipzig", "Wohnungsgenossenschaft eG
 *       Göttingen", "Beispiel (AG)") — or the token is the whole name — and
 *    b) no DIFFERENT legal form follows later in the name, because a company has one legal form and it
 *       closes the name ("Muster KG Immobilien GmbH" is a GmbH whose name contains "KG").
 *    So "SE Immobilien" and "AG Wohnen" keep their first token as part of the name and have no legal form.
 *
 * 3. With several recognised forms the LAST one is the company's own, except when a genitive article
 *    ("der" / "des") follows an earlier one: "Service GmbH der Wohnungsgenossenschaft Aufbau eG" is a
 *    GmbH that names its owner. Every recognised expression is removed from the name.
 *
 * 4. "GmbH & Co. <words> KG" ("Beispiel GmbH & Co. Objekt Nord KG") is the split spelling of the
 *    combined form and yields GMBH_CO_KG (likewise AG / SE / UG).
 *
 * 5. "Stiftung" is a legal form only as the last separate word of a name without any other legal form
 *    ("Schmidt Stiftung", "Schmidt-Stiftung"), never at the start ("Stiftung Liebenau") or inside a
 *    word ("Bürgerstiftung"). That rule needs the final tokens and lives in normalization.ts.
 *
 * Additions that describe a state, not the company ("i.L.", "in Liquidation", "i.G.", "in Gründung",
 * "i.I.", "in Insolvenz", "in Abwicklung"), are removed first, but only after at least one word
 * ("I.G. Beispiel" keeps its initials).
 */

/** German display labels of the legal form codes. */
export const LEGAL_FORM_LABELS: Record<LegalFormCode, string> = {
  GMBH: "GmbH",
  GGMBH: "gGmbH",
  UG: "UG (haftungsbeschränkt)",
  AG: "AG",
  SE: "SE",
  KGAA: "KGaA",
  GMBH_CO_KG: "GmbH & Co. KG",
  AG_CO_KG: "AG & Co. KG",
  SE_CO_KG: "SE & Co. KG",
  UG_CO_KG: "UG (haftungsbeschränkt) & Co. KG",
  KG: "KG",
  OHG: "OHG",
  EG: "eG",
  EV: "e.V.",
  AOER: "AöR",
  KDOER: "KdöR",
  STIFTUNG: "Stiftung",
  GBR: "GbR",
  EK: "e.K.",
  PARTG: "PartG",
};

/** Result of `extractLegalForm`. */
export interface LegalFormExtraction {
  /** The company's own legal form, or null when none was recognised. */
  legalForm: LegalFormCode | null;
  /** The input with every recognised expression (and state additions) replaced by blanks. */
  rest: string;
}

interface FormPattern {
  code: LegalFormCode;
  /** Regular-expression source, matched between word boundaries. */
  source: string;
  ambiguous?: boolean;
  /** Matches the end of a longer word instead of a separate word. */
  wordEnding?: boolean;
}

interface FormSpan {
  start: number;
  end: number;
  code: LegalFormCode;
  ambiguous: boolean;
  accepted: boolean;
  /** False for the trailing "KG" of a split "GmbH & Co. … KG": removed, but not a form of its own. */
  countsAsForm: boolean;
}

// A word starts here: no letter/digit directly before, and not in the middle of a dotted
// abbreviation ("W.E.G." must not yield "e.G.").
const WORD_START = "(?<![\\p{L}\\p{N}])(?<!(?<![\\p{L}\\p{N}])\\p{L}\\.)";
// A word ends here: no letter/digit directly after, and no further single letter of a dotted
// abbreviation ("S.E.V." must not yield "S.E.").
const WORD_END = "(?![\\p{L}\\p{N}])(?!\\.\\p{L}(?![\\p{L}\\p{N}]))";

const CONNECTOR = "(?:&|\\+|und|u\\.)";
/** " & Co. " in all spellings, including "&Co." and a missing connector. */
const AND_CO = `\\s*${CONNECTOR}?\\s*co\\.?\\s*`;

const HAFTUNG = "mit\\s+beschraenkter\\s+haftung";
const GMBH_ABBREVIATION = "(?:gmbh|g\\.\\s?m\\.\\s?b\\.\\s?h\\.?|mbh|m\\.\\s?b\\.\\s?h\\.?)";
// A separate word "Gesellschaft" / "Ges." directly before "mbH" belongs to the legal form
// ("Beispiel Gesellschaft mbH" = "Beispiel GmbH"). After a hyphen it is the second half of a compound
// ("Wohnungsbau-Gesellschaft mbH" = "Wohnungsbaugesellschaft mbH") and stays in the name.
const GESELLSCHAFT_PREFIX = "(?:(?<![\\p{L}\\p{N}\\-])(?:gesellschaft\\s+|ges\\.?\\s*))?";
const GMBH = `${GESELLSCHAFT_PREFIX}(?:${GMBH_ABBREVIATION}|${HAFTUNG})`;

const UG_QUALIFIED =
  "(?:ug\\s*\\(\\s*haftungsbeschraenkt\\s*\\)|ug\\s+haftungsbeschraenkt" +
  "|unternehmergesellschaft(?:\\s*\\(\\s*haftungsbeschraenkt\\s*\\)|\\s+haftungsbeschraenkt)?)";
const AG = "(?:ag|a\\.\\s?g\\.?|aktiengesellschaft)";
const SE = "(?:se|s\\.\\s?e\\.?)";
const KG = "(?:kg|k\\.\\s?g\\.?|kommanditgesellschaft)";
const KGAA = "(?:kgaa|kg\\s?a\\.\\s?a\\.?|k\\.\\s?g\\.\\s?a\\.\\s?a\\.?|(?:kommanditgesellschaft|kg)\\s+auf\\s+aktien)";
const OHG = "(?:ohg|o\\.\\s?h\\.\\s?g\\.?|offene\\s+handelsgesellschaft)";

/**
 * Ordered from most to least specific: an earlier pattern claims its text first, so "GmbH & Co. KG"
 * is never seen as "GmbH" plus "KG".
 */
const FORM_PATTERNS: readonly FormPattern[] = [
  { code: "KGAA", source: `(?:${GMBH}|${AG}|${SE}|${UG_QUALIFIED}|ug)${AND_CO}${KGAA}` },
  { code: "GMBH_CO_KG", source: `${GMBH}${AND_CO}${KG}` },
  { code: "AG_CO_KG", source: `${AG}${AND_CO}${KG}` },
  { code: "SE_CO_KG", source: `${SE}${AND_CO}${KG}` },
  { code: "UG_CO_KG", source: `(?:${UG_QUALIFIED}|ug)${AND_CO}${KG}` },
  { code: "OHG", source: `(?:${GMBH}|${AG})${AND_CO}${OHG}` },
  { code: "GGMBH", source: `ggmbh|gemeinnuetzige\\s+(?:gmbh|gesellschaft\\s+(?:mbh|${HAFTUNG}))` },
  { code: "GMBH", source: GMBH },
  { code: "UG", source: `${UG_QUALIFIED}|haftungsbeschraenkt` },
  { code: "KGAA", source: KGAA },
  { code: "AG", source: "aktiengesellschaft" },
  { code: "AG", source: "(?<=\\p{L}{3})aktiengesellschaft", wordEnding: true },
  { code: "KG", source: "kommanditgesellschaft" },
  { code: "OHG", source: OHG },
  { code: "EG", source: "eingetragene\\s+genossenschaft|egmbh|e\\.\\s?g\\.\\s?m\\.\\s?b\\.\\s?h\\.?" },
  { code: "EV", source: "eingetragener\\s+verein" },
  { code: "AOER", source: "aoer|a\\.\\s?oe\\.\\s?r\\.?|anstalt\\s+(?:des\\s+)?oeffentlichen\\s+rechts" },
  { code: "KDOER", source: "kdoer|k\\.\\s?d\\.\\s?oe\\.\\s?r\\.?|koerperschaft\\s+(?:des\\s+)?oeffentlichen\\s+rechts" },
  { code: "SE", source: "societas\\s+europaea" },
  {
    code: "GBR",
    source: "egbr|gbr|g\\.\\s?b\\.\\s?r\\.?|gesellschaft\\s+(?:des\\s+)?buergerlichen\\s+rechts|bgb[\\s\\-]gesellschaft",
  },
  {
    code: "PARTG",
    source:
      "partg\\s?mbb|partg|partnerschaftsgesellschaft(?:\\s+mbb|\\s+mit\\s+beschraenkter\\s+berufshaftung)?" +
      "|partnerschaft\\s+(?:mbb|mit\\s+beschraenkter\\s+berufshaftung)|mbb",
  },
  {
    code: "EK",
    source:
      "eingetragener\\s+kaufmann|eingetragene\\s+kauffrau|e\\.\\s?kfm\\.?|e\\.\\s?kfr\\.?|ekfm|ekfr" +
      "|inh(?=\\.)|inhaber(?:in)?",
  },
  { code: "AG", source: "ag|a\\.\\s?g\\.?", ambiguous: true },
  { code: "SE", source: "se|s\\.\\s?e\\.?", ambiguous: true },
  { code: "EG", source: "eg|e\\.\\s?g\\.?", ambiguous: true },
  { code: "KG", source: "kg|k\\.\\s?g\\.?", ambiguous: true },
  { code: "UG", source: "ug|u\\.\\s?g\\.?", ambiguous: true },
  { code: "EV", source: "ev|e\\.\\s?v\\.?", ambiguous: true },
  { code: "EK", source: "ek|e\\.\\s?k\\.?", ambiguous: true },
];

const COMPILED_PATTERNS: ReadonlyArray<{ pattern: FormPattern; regex: RegExp }> = FORM_PATTERNS.map((pattern) => ({
  pattern,
  regex: new RegExp(`${pattern.wordEnding ? "" : WORD_START}(?:${pattern.source})${WORD_END}`, "gu"),
}));

const STATE_ADDITION = new RegExp(
  `${WORD_START}(?:in\\s+(?:liquidation|abwicklung|gruendung|insolvenz)` +
    `|i\\.\\s?(?:liqu|liq|abw|ins|gr|l|g|i)\\.?)${WORD_END}`,
  "gu",
);

const HAS_WORD = /[\p{L}\p{N}]/u;
const GENITIVE_ARTICLE = /(?<![\p{L}\p{N}])(?:der|des)(?![\p{L}\p{N}])/u;
const AND_CO_AT_START = new RegExp(`^\\s*${CONNECTOR}?\\s*co\\.?(?![\\p{L}\\p{N}])`, "u");

/** Combined form for the split spelling "<form> & Co. <words> KG". */
const SPLIT_CO_KG: Partial<Record<LegalFormCode, LegalFormCode>> = {
  GMBH: "GMBH_CO_KG",
  AG: "AG_CO_KG",
  SE: "SE_CO_KG",
  UG: "UG_CO_KG",
};

function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}

/** Removes "i.L." / "in Liquidation" and similar additions that follow at least one word. */
function stripStateAdditions(text: string): string {
  let result = text;

  for (const match of text.matchAll(STATE_ADDITION)) {
    const start = match.index ?? 0;
    // At the very start the letters are initials or part of the name, not an addition.
    if (!HAS_WORD.test(text.slice(0, start))) continue;
    result = blank(result, start, start + match[0].length);
  }

  return result;
}

/** All legal-form expressions in the text, without overlaps, ordered by position. */
function findSpans(text: string): FormSpan[] {
  const spans: FormSpan[] = [];

  for (const { pattern, regex } of COMPILED_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (spans.some((span) => start < span.end && end > span.start)) continue;

      spans.push({
        start,
        end,
        code: pattern.code,
        ambiguous: pattern.ambiguous === true,
        accepted: false,
        countsAsForm: true,
      });
    }
  }

  return spans.sort((left, right) => left.start - right.start);
}

/**
 * Rule 4: turns "<GmbH|AG|SE|UG> & Co. <words> KG" into one combined form. The "& Co." is absorbed by
 * the first expression, the trailing "KG" is still removed but no longer counts as a form of its own.
 */
function mergeSplitCoKg(text: string, spans: FormSpan[]): void {
  const last = spans[spans.length - 1];
  if (!last || last.code !== "KG") return;

  for (let index = spans.length - 2; index >= 0; index -= 1) {
    const span = spans[index];
    const combined = SPLIT_CO_KG[span.code];
    if (!combined) continue;

    const andCo = AND_CO_AT_START.exec(text.slice(span.end, last.start));
    if (!andCo) continue;

    span.code = combined;
    span.ambiguous = false;
    span.end += andCo[0].length;
    last.ambiguous = false;
    last.countsAsForm = false;
    return;
  }
}

function hasGenitiveArticle(text: string, from: number, to: number): boolean {
  return GENITIVE_ARTICLE.test(text.slice(from, to));
}

/** Rule 2: decides for every span whether it really is a legal form (right to left). */
function acceptSpans(text: string, spans: FormSpan[]): void {
  const laterCodes = new Set<LegalFormCode>();

  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index];

    if (!span.ambiguous) {
      span.accepted = true;
    } else {
      const next = spans.slice(index + 1).find((candidate) => candidate.accepted && candidate.countsAsForm);
      const wordBefore = HAS_WORD.test(text.slice(0, span.start));
      const isWholeName = !wordBefore && !HAS_WORD.test(text.slice(span.end));
      const differentFormFollows = [...laterCodes].some((code) => code !== span.code);
      // "… AG der Stadt … GmbH": the genitive marks the later form as belonging to somebody else.
      const ownerFollows = next !== undefined && hasGenitiveArticle(text, span.end, next.start);

      span.accepted = (wordBefore || isWholeName) && (!differentFormFollows || ownerFollows);
    }

    if (span.accepted && span.countsAsForm) laterCodes.add(span.code);
  }
}

/** Rule 3: the company's own form among the accepted ones. */
function chooseForm(text: string, spans: FormSpan[]): LegalFormCode | null {
  const forms = spans.filter((span) => span.accepted && span.countsAsForm);
  if (forms.length === 0) return null;

  for (let index = 0; index < forms.length - 1; index += 1) {
    if (hasGenitiveArticle(text, forms[index].end, forms[index + 1].start)) return forms[index].code;
  }

  return forms[forms.length - 1].code;
}

/**
 * Finds the legal form in a folded company name and removes every legal-form expression from it
 * (rules 1–4 of the file comment; the "Stiftung" rule is applied by the caller on the final tokens).
 */
export function extractLegalForm(folded: string): LegalFormExtraction {
  const text = stripStateAdditions(folded);
  const spans = findSpans(text);

  mergeSplitCoKg(text, spans);
  acceptSpans(text, spans);

  let rest = text;
  for (const span of spans) {
    if (span.accepted) rest = blank(rest, span.start, span.end);
  }

  return { legalForm: chooseForm(text, spans), rest };
}
