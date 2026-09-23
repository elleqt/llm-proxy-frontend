import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createOpenApiHttp } from "openapi-msw";
import type { ErrorBody } from "../shared/api/client";
import type { components, paths } from "../shared/api/schema";

/** MSW's `http`, typed by the contract: an unknown path or a wrong body fails the type check. */
export const http = createOpenApiHttp<paths>({ baseUrl: location.origin });

/**
 * Tests register handlers per case with `server.use(...)`; unmatched requests
 * fail. The one standing answer: the signed-in user may use some models, which
 * every cabinet and connect screen asks. A test about that list overrides it.
 */
export const server = setupServer(
  http.get("/api/me/models", ({ response }) =>
    response(200).json({ providers: [{ name: "claude", models: ["claude-sonnet-5"] }] }),
  ),
);

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
  adminUser: (overrides: Partial<Schemas["AdminUser"]> = {}): Schemas["AdminUser"] => ({
    id: "00000000-0000-4000-8000-0000000000b1",
    kind: "human",
    displayName: "Grace Example",
    email: "grace@example.com",
    role: "user",
    status: "active",
    policy: ["claude:*"],
    policySource: "local",
    mustChangePassword: false,
    signIn: ["password"],
    lastSeenAt: "2026-09-22T08:00:00Z",
    createdAt: "2026-08-01T09:00:00Z",
    ...overrides,
  }),
  providerAccount: (overrides: Partial<Schemas["ProviderAccount"]> = {}): Schemas["ProviderAccount"] => ({
    id: "claude-ops@example.com",
    provider: "claude",
    label: "ops",
    email: "ops@example.com",
    status: "active",
    disabled: false,
    lastError: null,
    lastRefreshedAt: "2026-09-23T07:00:00Z",
    quota: [{ window: "5h", usedRatio: 0.4, resetAt: "2026-09-23T12:00:00Z", observedAt: "2026-09-23T09:00:00Z" }],
    ...overrides,
  }),
  catalog: (): Schemas["Catalog"] => ({
    providers: [
      { name: "claude", models: ["claude-sonnet-5", "claude-opus-5"] },
      { name: "chatgpt", models: ["gpt-6"] },
    ],
  }),
};
