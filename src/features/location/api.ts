import { ApiError, apiRequest } from "@/lib/api";
import type {
  GeocodeResponse,
  NearbyPlacesResponse,
  ResolvedAddress,
} from "./types";

/**
 * autocomplete = true: suggestions while typing. false: explicit resolution of a submitted address.
 * Pass the AbortSignal of the query so outdated requests are cancelled.
 */
export const addressSearch = (
  q: string,
  autocomplete: boolean,
  signal?: AbortSignal,
) =>
  apiRequest<GeocodeResponse>(
    `/data-sources/${autocomplete ? "address-suggestions" : "geocode"}?q=${encodeURIComponent(q)}`,
    { signal },
  );

export const nearbyPlaces = (
  address: Pick<ResolvedAddress, "latitude" | "longitude">,
  radius: number,
  signal?: AbortSignal,
) =>
  apiRequest<NearbyPlacesResponse>(
    `/data-sources/nearby-places?${new URLSearchParams({ lat: String(address.latitude), lon: String(address.longitude), radius: String(radius) })}`,
    { signal },
  );

const ADDRESS_PARAMS = [
  "street",
  "houseNumber",
  "postalCode",
  "city",
  "country",
] as const;

/** Query parameters that describe a confirmed address in the /check URL. */
export function addressParams(address: ResolvedAddress): URLSearchParams {
  const p = new URLSearchParams({
    address: address.label,
    lat: String(address.latitude),
    lng: String(address.longitude),
    accuracy: address.accuracy,
  });
  for (const k of ADDRESS_PARAMS) if (address[k]) p.set(k, address[k]!);
  return p;
}

export function addressUrl(address: ResolvedAddress) {
  return `/check?${addressParams(address)}`;
}

/** Link that lets /check resolve a free-text address itself (no coordinates known yet). */
export function addressQueryUrl(query: string) {
  return `/check?${new URLSearchParams({ address: query })}`;
}

export type LocationErrorKind =
  | "config"
  | "timeout"
  | "quota"
  | "rate-limit"
  | "offline"
  | "unavailable";

export function locationErrorKind(error: unknown): LocationErrorKind {
  if (!(error instanceof ApiError)) return "offline";
  if (error.code === "NOT_CONFIGURED") return "config";
  if (error.code === "TIMEOUT" || error.status === 504) return "timeout";
  if (error.code === "QUOTA") return "quota";
  if (error.status === 429) return "rate-limit";
  return "unavailable";
}

function waitHint(seconds?: number) {
  if (!seconds || seconds <= 0) return "";
  return seconds < 90
    ? ` Bitte versuche es in etwa ${Math.ceil(seconds / 10) * 10} Sekunden erneut.`
    : ` Bitte versuche es in etwa ${Math.ceil(seconds / 60)} Minuten erneut.`;
}

/** German text for each failure of the location endpoints, so the states stay distinguishable. */
export function locationErrorText(
  error: unknown,
  subject: "places" | "address",
): { title: string; text: string; retry: boolean } {
  const what = subject === "places" ? "Die Umgebungsdaten" : "Adressen";
  const seconds =
    error instanceof ApiError ? error.retryAfterSeconds : undefined;
  switch (locationErrorKind(error)) {
    case "config":
      return {
        title: "Standortsuche nicht eingerichtet",
        text: "Dem Server fehlt der Zugang zum Kartendienst (GEOAPIFY_API_KEY). Es werden bewusst keine Beispieldaten angezeigt.",
        retry: false,
      };
    case "timeout":
      return {
        title: "Zeitüberschreitung",
        text: `Der Kartendienst hat nicht rechtzeitig geantwortet. ${what} konnten nicht geladen werden.`,
        retry: true,
      };
    case "quota":
      return {
        title: "Kontingent ausgeschöpft",
        text: `Das Abfragekontingent des Kartendienstes ist momentan ausgeschöpft.${waitHint(seconds) || " Bitte versuche es später erneut."}`,
        retry: true,
      };
    case "rate-limit":
      return {
        title: "Zu viele Anfragen",
        text: "Du hast in kurzer Zeit sehr viele Anfragen gestellt. Bitte warte eine Minute und versuche es erneut.",
        retry: true,
      };
    case "offline":
      return {
        title: "Keine Verbindung",
        text: "Der WohnCheck-Server ist nicht erreichbar. Bitte prüfe deine Verbindung.",
        retry: true,
      };
    default:
      return {
        title: "Kartendienst nicht erreichbar",
        text: `${what} konnten momentan nicht geladen werden.`,
        retry: true,
      };
  }
}
