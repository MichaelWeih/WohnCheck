/** Sources that may be used: DISCOVERY_SOURCES (comma separated), default "wikidata,gleif". */
export function enabledSources(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.DISCOVERY_SOURCES?.trim();
  return new Set((raw ? raw : "wikidata,gleif").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function isSourceEnabled(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return enabledSources(env).has(key);
}

/** DISCOVERY_SEARCH_ON_MISS (default true) and its global cap per hour (default 30). */
export function searchOnMissConfig(env: NodeJS.ProcessEnv = process.env): { enabled: boolean; maxPerHour: number } {
  const enabled = env.DISCOVERY_SEARCH_ON_MISS?.trim().toLowerCase() !== "false";
  const parsed = Number(env.DISCOVERY_SEARCH_ON_MISS_MAX_PER_HOUR);
  return { enabled, maxPerHour: Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 30 };
}
