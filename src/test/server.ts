import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createOpenApiHttp } from "openapi-msw";
import type { ErrorBody } from "../shared/api/client";
import type { components, paths } from "../shared/api/schema";

/** MSW's `http`, typed by the contract: an unknown path or a wrong body fails the type check. */
export const http = createOpenApiHttp<paths>({ baseUrl: location.origin });

/** Tests register handlers per case with `server.use(...)`; unmatched requests fail. */
export const server = setupServer();

/**
 * An `Error` response for statuses the contract states once, as a convention
 * (401, 403 `password_change_required`), rather than per operation.
 */
export function errorResponse(status: number, body: ErrorBody) {
  return HttpResponse.json(body, { status });
}

export type Schemas = components["schemas"];

export const fixtures = {
  me: (overrides: Partial<Schemas["Me"]> = {}): Schemas["Me"] => ({
    id: "00000000-0000-4000-8000-000000000001",
    kind: "human",
    displayName: "Ada Example",
    email: "ada@example.com",
    role: "user",
    restricted: false,
    policy: ["chatgpt:*"],
    policySource: "local",
    ...overrides,
  }),
  token: (overrides: Partial<Schemas["Token"]> = {}): Schemas["Token"] => ({
    id: "00000000-0000-4000-8000-0000000000a1",
    label: "laptop",
    prefix: "sk-a1b2",
    createdAt: "2026-09-01T09:00:00Z",
    lastUsedAt: "2026-09-20T15:30:00Z",
    revokedAt: null,
    ...overrides,
  }),
  /** Usage with no requests in the period. */
  usage: (overrides: Partial<Schemas["Usage"]> = {}): Schemas["Usage"] => ({
    from: "2026-09-22T10:00:00Z",
    to: "2026-09-23T10:00:00Z",
    bucket: "hour",
    totals: { requests: 0, tokensTotal: 0 },
    points: [],
    ...overrides,
  }),
};
