// Development only: `VITE_MOCK_API=1 npm run dev` answers /api in the browser
// with an in-memory backend, so the screens can be looked at without one.
// main.tsx imports this behind `import.meta.env.DEV`, so no build contains it.
import { HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { createOpenApiHttp } from "openapi-msw";
import type { components, paths } from "../shared/api/schema";

type Schemas = components["schemas"];

const http = createOpenApiHttp<paths>({ baseUrl: location.origin });

const HOUR = 3_600_000;
const MODELS = ["claude-sonnet-5", "gpt-6", "gemini-3-pro"];

let me: Schemas["Me"] | null = null;
let tokens: Schemas["Token"][] = [
  {
    id: crypto.randomUUID(),
    label: "laptop",
    prefix: "sk-4f2a",
    createdAt: new Date(Date.now() - 20 * 24 * HOUR).toISOString(),
    lastUsedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    revokedAt: null,
  },
  {
    id: crypto.randomUUID(),
    label: "ci runner",
    prefix: "sk-91c0",
    createdAt: new Date(Date.now() - 2 * 24 * HOUR).toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  },
  {
    id: crypto.randomUUID(),
    label: "old desktop",
    prefix: "sk-07be",
    createdAt: new Date(Date.now() - 90 * 24 * HOUR).toISOString(),
    lastUsedAt: new Date(Date.now() - 40 * 24 * HOUR).toISOString(),
    revokedAt: new Date(Date.now() - 30 * 24 * HOUR).toISOString(),
  },
];

const unauthenticated = () =>
  HttpResponse.json({ code: "unauthenticated", message: "no session" }, { status: 401 });

function usage(from: Date, to: Date): Schemas["Usage"] {
  const bucket = to.getTime() - from.getTime() > 2 * 24 * HOUR ? "day" : "hour";
  const step = bucket === "hour" ? HOUR : 24 * HOUR;
  const points: Schemas["Usage"]["points"] = [];
  for (let at = Math.floor(from.getTime() / step) * step; at < to.getTime(); at += step) {
    MODELS.forEach((model, i) => {
      const wave = Math.sin(at / step / (2 + i)) + 1.2;
      const requests = Math.round(wave * (6 - i * 2));
      if (requests > 0) {
        points.push({ at: new Date(at).toISOString(), model, requests, tokensTotal: requests * (900 + i * 700) });
      }
    });
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bucket,
    totals: {
      requests: points.reduce((sum, p) => sum + p.requests, 0),
      tokensTotal: points.reduce((sum, p) => sum + p.tokensTotal, 0),
    },
    points,
  };
}

const handlers = [
  http.get("/api/auth/config", ({ response }) =>
    response(200).json({ localLogin: true, oidc: { enabled: true, displayName: "Example ID" } }),
  ),
  http.post("/api/auth/login", async ({ request, response }) => {
    const { email, password } = await request.json();
    if (password === "locked") {
      return response.untyped(
        HttpResponse.json({ code: "locked_out", message: "" }, { status: 429, headers: { "Retry-After": "300" } }),
      );
    }
    if (password !== "password") return response(401).json({ code: "invalid_credentials", message: "" });
    me = {
      id: crypto.randomUUID(),
      kind: "human",
      displayName: email,
      email,
      role: email.startsWith("admin") ? "admin" : "user",
      restricted: email.startsWith("temp"),
      policy: ["claude:*"],
      policySource: "local",
    };
    return response(200).json(me);
  }),
  http.post("/api/auth/logout", () => {
    me = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/auth/password", ({ response }) => {
    if (me === null) return response.untyped(unauthenticated());
    me = { ...me, restricted: false };
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/me", ({ response }) => (me === null ? response.untyped(unauthenticated()) : response(200).json(me))),
  http.get("/api/me/tokens", ({ response }) =>
    me === null ? response.untyped(unauthenticated()) : response(200).json(tokens),
  ),
  http.post("/api/me/tokens", async ({ request, response }) => {
    const { label } = await request.json();
    const secret = `sk-${crypto.randomUUID().replaceAll("-", "")}`;
    const token: Schemas["Token"] = {
      id: crypto.randomUUID(),
      label,
      prefix: secret.slice(0, 7),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    tokens = [token, ...tokens];
    return response(201).json({ token, secret });
  }),
  http.delete("/api/me/tokens/{tokenId}", ({ params }) => {
    tokens = tokens.map((t) => (t.id === params.tokenId ? { ...t, revokedAt: new Date().toISOString() } : t));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/me/usage", ({ query, response }) => {
    const to = new Date(query.get("to") ?? Date.now());
    const from = new Date(query.get("from") ?? to.getTime() - 7 * 24 * HOUR);
    return response(200).json(usage(from, to));
  }),
  http.get("/api/connect", ({ response }) => response(200).json({ apiBaseURL: "https://llm.example.com" })),
];

export async function startMockApi(): Promise<void> {
  await setupWorker(...handlers).start({ onUnhandledRequest: "bypass", quiet: true });
}
