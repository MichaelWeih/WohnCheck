import { HttpException, HttpStatus } from "@nestjs/common";
import { OutboundHttpError } from "../../../common/http/outbound-http.types";
import {
  CategoryIssueReason,
  LocationErrorCode,
} from "../../../common/api/location-types";

const STATUS: Record<LocationErrorCode, number> = {
  NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  QUOTA: HttpStatus.SERVICE_UNAVAILABLE,
  UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

const MESSAGE: Record<LocationErrorCode, string> = {
  NOT_CONFIGURED:
    "Die Standortsuche ist noch nicht eingerichtet (Geoapify-Schlüssel fehlt oder ist ungültig).",
  TIMEOUT:
    "Der Kartendienst hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.",
  QUOTA:
    "Das Abfragekontingent des Kartendienstes ist momentan ausgeschöpft. Bitte versuche es später erneut.",
  UNAVAILABLE:
    "Der Kartendienst ist momentan nicht erreichbar. Bitte versuche es erneut.",
};

/**
 * Error of the location endpoints. The body carries a machine-readable `code` so the client can tell a
 * timeout from an exhausted quota or a missing configuration: { statusCode, message, code, retryAfterSeconds? }.
 */
export class LocationProviderException extends HttpException {
  constructor(
    public readonly code: LocationErrorCode,
    public readonly retryAfterSeconds?: number,
  ) {
    super(
      {
        statusCode: STATUS[code],
        message: MESSAGE[code],
        code,
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      },
      STATUS[code],
    );
  }
}

export function missingKey(): LocationProviderException {
  return new LocationProviderException("NOT_CONFIGURED");
}

/** Maps any provider failure to a client-facing error without leaking URLs, keys or search text. */
export function toLocationException(error: unknown): LocationProviderException {
  if (error instanceof LocationProviderException) return error;
  if (error instanceof OutboundHttpError) {
    if (error.kind === "timeout") return new LocationProviderException("TIMEOUT");
    if (error.kind === "rate_limited" || error.kind === "budget") {
      const seconds = error.retryAt
        ? Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1000))
        : undefined;
      return new LocationProviderException("QUOTA", seconds);
    }
    if (error.status === 401 || error.status === 403)
      return new LocationProviderException("NOT_CONFIGURED");
  }
  return new LocationProviderException("UNAVAILABLE");
}

export function issueReason(error: LocationProviderException): CategoryIssueReason {
  if (error.code === "TIMEOUT") return "timeout";
  if (error.code === "QUOTA") return "quota";
  return "error";
}

/** When every category failed, the most actionable reason is reported. */
export function mostRelevant(
  errors: LocationProviderException[],
): LocationProviderException {
  const order: LocationErrorCode[] = [
    "NOT_CONFIGURED",
    "QUOTA",
    "TIMEOUT",
    "UNAVAILABLE",
  ];
  return (
    order
      .map((code) => errors.find((error) => error.code === code))
      .find((error) => error !== undefined) ??
    new LocationProviderException("UNAVAILABLE")
  );
}
