import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type ErrorBody = components["schemas"]["Error"];

/** Code for a request that never produced an HTTP response. */
export const NETWORK_ERROR = "network_error";
/** Code for an error response whose body carries no `Error` code. */
export const UNKNOWN_ERROR = "unknown_error";
export const PASSWORD_CHANGE_REQUIRED = "password_change_required";

/** Every failed call surfaces as this. `status` is 0 when there was no response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: number, code: string, field?: string) {
    super(`${status} ${code}${field === undefined ? "" : ` (${field})`}`);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** 401: no session. The router sends the user to /login. */
export class UnauthenticatedError extends ApiError {}

/** 403 `password_change_required`: a restricted session. The router sends the user to /password. */
export class PasswordChangeRequiredError extends ApiError {}

export const client = createClient<paths>({
  // Absolute, so the client also works where `Request` rejects relative URLs.
  baseUrl: globalThis.location.origin,
  credentials: "same-origin",
  // Looked up per call rather than captured at import, so anything that wraps
  // `fetch` later (request mocking in tests) is honoured.
  fetch: (request) => globalThis.fetch(request),
});

function toApiError(status: number, body: unknown): ApiError {
  const { code, field } = readErrorBody(body);
  if (status === 401) return new UnauthenticatedError(status, code, field);
  if (status === 403 && code === PASSWORD_CHANGE_REQUIRED) {
    return new PasswordChangeRequiredError(status, code, field);
  }
  return new ApiError(status, code, field);
}

function readErrorBody(body: unknown): { code: string; field: string | undefined } {
  if (typeof body !== "object" || body === null) return { code: UNKNOWN_ERROR, field: undefined };
  const { code, field } = body as Partial<Record<keyof ErrorBody, unknown>>;
  return {
    code: typeof code === "string" && code !== "" ? code : UNKNOWN_ERROR,
    field: typeof field === "string" ? field : undefined,
  };
}

interface Outcome<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Awaits an `openapi-fetch` call and returns its data, or throws the
 * normalised `ApiError` — including for a network failure.
 *
 *     const me = await unwrap(client.GET("/api/me"));
 */
export async function unwrap<T>(call: Promise<Outcome<T>>): Promise<T> {
  let outcome: Outcome<T>;
  try {
    outcome = await call;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!outcome.response.ok) throw toApiError(outcome.response.status, outcome.error);
  return outcome.data as T;
}
