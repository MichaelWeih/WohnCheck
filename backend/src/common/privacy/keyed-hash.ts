import { createHmac } from "node:crypto";

/**
 * Keyed hash (HMAC-SHA256, hex) for values we must be able to recognise again without storing them
 * in clear text: search-on-miss queries (cache key) and names on the suppression list.
 *
 * `purpose` separates the domains, so the same text hashed for two purposes yields unrelated values.
 * The secret is PRIVACY_HASH_SECRET, falling back to JWT_SECRET so that no new mandatory setting is needed.
 * Changing the secret invalidates existing hashes (cached queries expire anyway; suppression entries
 * of type "name" would no longer match — keep the secret stable in production).
 */
export function keyedHash(purpose: "discovery-query" | "suppression-name", value: string): string {
  const secret = process.env.PRIVACY_HASH_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("PRIVACY_HASH_SECRET (or JWT_SECRET) must be set to compute keyed hashes.");
  }

  return createHmac("sha256", secret).update(`${purpose}\n${value}`, "utf8").digest("hex");
}
