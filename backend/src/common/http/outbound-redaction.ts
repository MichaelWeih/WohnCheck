/**
 * Redaction helpers shared by the outbound HTTP client and the job queue: nothing that is logged, thrown
 * or persisted (OutboundHttpError, BackgroundJob.lastError, log lines) may carry credentials.
 */

const REDACTED = "REDACTED";

/** Query parameter names (lower-cased, separators removed) whose value is always a secret. */
const SECRET_PARAMETER_NAMES = new Set([
  "key",
  "apikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "clientsecret",
  "password",
  "passwd",
  "pwd",
  "auth",
  "authorization",
  "signature",
  "sig",
]);

/** Suffixes that mark a parameter as secret whatever its prefix is (e.g. "x-api-key", "session_token"). */
const SECRET_PARAMETER_SUFFIXES = ["apikey", "token", "secret", "password"];

/** True when a query parameter with this name carries a credential (key, token, apikey, api_key, access_token, ...). */
export function isSecretParameterName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (SECRET_PARAMETER_NAMES.has(normalized)) return true;

  return SECRET_PARAMETER_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Full URL without userinfo and fragment and with the values of secret query parameters masked.
 * A string that is not a URL is never echoed back (it could be anything) and becomes "[invalid url]".
 */
export function redactUrl(raw: string): string {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return "[invalid url]";
  }

  url.username = "";
  url.password = "";
  url.hash = "";

  const secretNames = [...new Set(url.searchParams.keys())].filter(isSecretParameterName);

  // Only touch the query when needed: URLSearchParams re-serialises the whole query string.
  for (const name of secretNames) {
    url.searchParams.set(name, REDACTED);
  }

  return url.toString();
}

/**
 * Origin and path only. Used inside error messages, which end up in logs and in BackgroundJob.lastError:
 * the query string is dropped completely there because it may carry user search text, not only secrets.
 */
export function describeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[invalid url]";
  }
}

const USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@"'<>]+@/gi;
const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|token|secret|password|passwd|pwd|key)=([^\s&"'<>]+)/gi;

/**
 * Masks credentials in free text (error messages, log lines): userinfo of any URL scheme
 * (also database URLs), secret query parameters of http(s) URLs, Bearer / Basic tokens and
 * bare `name=value` pairs with a secret name.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(USERINFO_PATTERN, "$1")
    .replace(HTTP_URL_PATTERN, (match) => {
      // Sentence punctuation directly after a URL is not part of it.
      const trailing = /[.,;:!?)\]]+$/.exec(match)?.[0] ?? "";
      const candidate = trailing ? match.slice(0, -trailing.length) : match;
      const redacted = redactUrl(candidate);

      return redacted === "[invalid url]" ? `[invalid url]${trailing}` : `${redacted}${trailing}`;
    })
    .replace(AUTH_SCHEME_PATTERN, `$1 ${REDACTED}`)
    .replace(SECRET_ASSIGNMENT_PATTERN, `$1=${REDACTED}`);
}
