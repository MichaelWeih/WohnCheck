const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  status: number;
  /** Machine-readable reason from the error body, when the endpoint provides one. */
  code?: string;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RequestOptions = RequestInit & {
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "Die Anfrage konnte nicht verarbeitet werden.";
    let code: string | undefined;
    let retryAfterSeconds: number | undefined;

    try {
      const errorBody = (await response.json()) as {
        message?: string | string[];
        code?: unknown;
        retryAfterSeconds?: unknown;
      };

      if (typeof errorBody.code === "string") code = errorBody.code;
      if (typeof errorBody.retryAfterSeconds === "number") retryAfterSeconds = errorBody.retryAfterSeconds;

      if (Array.isArray(errorBody.message)) {
        message = errorBody.message.join(", ");
      } else if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // Ignore malformed error bodies and fall back to the default message.
    }

    throw new ApiError(message, response.status, code, retryAfterSeconds);
  }

  return response.json() as Promise<T>;
}

/** React Query retry policy: don't retry on 404s, retry other errors up to twice. */
export function retryUnlessNotFound(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status === 404) {
    return false;
  }

  return failureCount < 2;
}
