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

// ---- Admin fixtures ----------------------------------------------------------

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const CATALOG: Schemas["Catalog"] = {
  providers: [
    { name: "claude", models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-5"] },
    { name: "chatgpt", models: ["gpt-6", "gpt-6-mini", "o5"] },
    { name: "gemini", models: ["gemini-3-pro", "gemini-3-flash"] },
  ],
};

const ADMIN_ID = crypto.randomUUID();
let users: Schemas["AdminUser"][] = [
  {
    id: ADMIN_ID,
    kind: "human",
    displayName: "Admin Example",
    email: "admin@example.com",
    role: "admin",
    status: "active",
    policy: ["claude:*", "chatgpt:*"],
    policySource: "local",
    mustChangePassword: false,
    signIn: ["password"],
    lastSeenAt: ago(5 * 60_000),
    createdAt: ago(120 * 24 * HOUR),
  },
  {
    id: crypto.randomUUID(),
    kind: "human",
    displayName: "Grace Example",
    email: "grace@example.com",
    role: "user",
    status: "active",
    policy: ["claude:claude-sonnet-*", "chatgpt:gpt-6"],
    policySource: "local",
    mustChangePassword: false,
    signIn: ["password", "oidc"],
    lastSeenAt: ago(3 * HOUR),
    createdAt: ago(60 * 24 * HOUR),
  },
  {
    id: crypto.randomUUID(),
    kind: "human",
    displayName: "Hedy Example",
    email: "hedy@example.com",
    role: "user",
    status: "active",
    policy: ["gemini:*"],
    policySource: "idp",
    mustChangePassword: false,
    signIn: ["oidc"],
    lastSeenAt: ago(2 * 24 * HOUR),
    createdAt: ago(30 * 24 * HOUR),
  },
  {
    id: crypto.randomUUID(),
    kind: "human",
    displayName: "Linus Example",
    email: "linus@example.com",
    role: "user",
    status: "blocked",
    policy: [],
    policySource: "local",
    mustChangePassword: true,
    signIn: ["password"],
    lastSeenAt: null,
    createdAt: ago(10 * 24 * HOUR),
  },
  {
    id: crypto.randomUUID(),
    kind: "human",
    displayName: "Katherine Example",
    email: "katherine@example.com",
    role: "user",
    status: "active",
    policy: ["claude:*"],
    policySource: "local",
    mustChangePassword: false,
    signIn: [],
    invitationExpiresAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString(),
    lastSeenAt: null,
    createdAt: ago(2 * 24 * HOUR),
  },
  {
    id: crypto.randomUUID(),
    kind: "human",
    displayName: "Alan Example",
    email: "alan@example.com",
    role: "user",
    status: "active",
    policy: [],
    policySource: "local",
    mustChangePassword: false,
    signIn: [],
    invitationExpiresAt: ago(3 * 24 * HOUR),
    lastSeenAt: null,
    createdAt: ago(20 * 24 * HOUR),
  },
  {
    id: crypto.randomUUID(),
    kind: "service",
    displayName: "nightly-report",
    email: null,
    role: "user",
    status: "active",
    policy: ["claude:claude-haiku-5"],
    policySource: "local",
    mustChangePassword: false,
    signIn: [],
    lastSeenAt: ago(9 * HOUR),
    createdAt: ago(45 * 24 * HOUR),
  },
];
const userTokens = new Map<string, Schemas["Token"][]>(
  users.map((user) => [
    user.id,
    user.kind === "service"
      ? [
          {
            id: crypto.randomUUID(),
            label: "report-exporter",
            prefix: "sk-5e11",
            createdAt: ago(40 * 24 * HOUR),
            lastUsedAt: ago(9 * HOUR),
            revokedAt: null,
          },
        ]
      : [
          {
            id: crypto.randomUUID(),
            label: "laptop",
            prefix: "sk-c0de",
            createdAt: ago(20 * 24 * HOUR),
            lastUsedAt: user.lastSeenAt ?? null,
            revokedAt: null,
          },
        ],
  ]),
);

function activity(user: Schemas["AdminUser"]): Schemas["Activity"] {
  const token = userTokens.get(user.id)?.[0]?.id ?? null;
  const models = user.policy.length === 0 ? [] : ["claude-sonnet-5", "gpt-6", "claude-haiku-5"];
  return {
    requests: models.map((model, i) => ({
      at: ago((i + 1) * 37 * 60_000),
      tokenId: token,
      provider: model.startsWith("gpt") ? "chatgpt" : "claude",
      model,
      stream: i % 2 === 0,
      statusCode: i === 1 ? 403 : 200,
      tokensTotal: i === 1 ? 0 : 1200 + i * 830,
      latencyMs: 400 + i * 950,
    })),
    audit: [
      { at: ago(3 * HOUR), action: "auth.sign_in", target: user.email ?? user.displayName, actorId: user.id },
      { at: ago(26 * HOUR), action: "user.policy.update", target: user.id, actorId: ADMIN_ID },
      { at: ago(20 * 24 * HOUR), action: "token.issue", target: "laptop", actorId: user.id },
    ],
  };
}

/** The policy glob: `*` any run of characters, `?` one; everything else literal. */
function globMatch(pattern: string, value: string): boolean {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${source}$`).test(value);
}

function preview(rules: string[]): Schemas["PolicyPreview"] {
  const errors: Schemas["PolicyPreview"]["errors"] = [];
  const parsed: [string, string][] = [];
  for (const rule of rules) {
    const colon = rule.indexOf(":");
    if (colon <= 0 || colon === rule.length - 1 || /[[\]\s]/.test(rule)) errors.push({ rule, code: "invalid_rule" });
    else parsed.push([rule.slice(0, colon), rule.slice(colon + 1)]);
  }
  const covered = CATALOG.providers.flatMap((provider) =>
    provider.models
      .filter((model) => parsed.some(([p, m]) => globMatch(p, provider.name) && globMatch(m, model)))
      .map((model) => ({ provider: provider.name, model })),
  );
  return { errors, covered };
}

let accounts: Schemas["ProviderAccount"][] = [
  {
    id: "claude-ops@example.com",
    provider: "claude",
    label: "ops",
    email: "ops@example.com",
    status: "active",
    disabled: false,
    lastError: null,
    lastRefreshedAt: ago(40 * 60_000),
    quota: [
      {
        window: "5h",
        usedRatio: 0.42,
        resetAt: new Date(Date.now() + 2 * HOUR).toISOString(),
        observedAt: ago(60_000),
      },
      {
        window: "7d",
        usedRatio: 0.18,
        resetAt: new Date(Date.now() + 4 * 24 * HOUR).toISOString(),
        observedAt: ago(60_000),
      },
    ],
  },
  {
    id: "chatgpt-team@example.com",
    provider: "chatgpt",
    label: "team",
    email: "team@example.com",
    status: "error",
    disabled: false,
    lastError: "refresh token rejected (401)",
    lastRefreshedAt: ago(26 * HOUR),
    quota: [
      {
        window: "5h",
        usedRatio: 0.93,
        resetAt: new Date(Date.now() + 25 * 60_000).toISOString(),
        observedAt: ago(HOUR),
      },
    ],
  },
  {
    id: "claude-spare@example.com",
    provider: "claude",
    label: "spare",
    email: null,
    status: "disabled",
    disabled: true,
    lastError: null,
    lastRefreshedAt: null,
    quota: [],
  },
];
const loginSessions = new Map<string, { provider: string; expiresAt: number }>();
/** How long the mock's vendor sign-in link lives: short, so its expiry can be watched. */
const LOGIN_LIFETIME_MS = 3 * 60_000;

let settings: Schemas["Settings"] = {
  yaml: 'proxy-url: ""\nrequest-retry: 3\nmax-retry-interval: 30\nrouting:\n  strategy: round-robin\n',
  fields: { proxyURL: "", requestRetry: 3, maxRetryInterval: 30 },
};
/** Keys the gateway owns: the mock refuses them like the backend does. */
const OWNED_SETTINGS = ["port", "host", "auth-dir", "remote-management", "api-keys"];

function yamlWith(fields: NonNullable<Schemas["Settings"]["fields"]>): string {
  return settings.yaml
    .replace(/^proxy-url: .*$/m, `proxy-url: ${JSON.stringify(fields.proxyURL ?? "")}`)
    .replace(/^request-retry: .*$/m, `request-retry: ${fields.requestRetry ?? 0}`)
    .replace(/^max-retry-interval: .*$/m, `max-retry-interval: ${fields.maxRetryInterval ?? 0}`);
}

function fieldsOf(yaml: string): Schemas["Settings"]["fields"] {
  const read = (key: string) => new RegExp(`^${key}: (.*)$`, "m").exec(yaml)?.[1]?.trim();
  return {
    proxyURL: JSON.parse(read("proxy-url") ?? '""') as string,
    requestRetry: Number(read("request-retry") ?? 0),
    maxRetryInterval: Number(read("max-retry-interval") ?? 0),
  };
}

/** A line diff good enough to look at: removed lines, then added ones. */
function diffOf(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const removed = a.filter((line) => line !== "" && !b.includes(line)).map((line) => `-${line}`);
  const added = b.filter((line) => line !== "" && !a.includes(line)).map((line) => `+${line}`);
  return removed.length + added.length === 0 ? "" : `--- running\n+++ proposed\n${[...removed, ...added].join("\n")}\n`;
}

// The price catalog: a few dozen models, as an automatic source would publish them.
const CATALOG_PRICES: Schemas["ModelPrice"][] = [
  ...[
    ["claude-opus-5", 15, 75],
    ["claude-opus-4-5", 5, 25],
    ["claude-sonnet-5", 3, 15],
    ["claude-sonnet-4-5", 3, 15],
    ["claude-haiku-5", 1, 5],
    ["claude-haiku-4-5", 1, 5],
    ["claude-3-7-sonnet", 3, 15],
    ["claude-3-5-haiku", 0.8, 4],
  ].map(([model, input, output]) => ({
    provider: "claude",
    model: model as string,
    input: input as number,
    output: output as number,
    cacheRead: (input as number) / 10,
    cacheWrite: (input as number) * 1.25,
  })),
  ...[
    ["gpt-6", 2.5, 10],
    ["gpt-6-mini", 0.4, 1.6],
    ["gpt-6-nano", 0.1, 0.4],
    ["gpt-5.1", 1.25, 10],
    ["gpt-5.1-mini", 0.25, 2],
    ["gpt-5.1-codex", 1.25, 10],
    ["gpt-5", 1.25, 10],
    ["gpt-5-mini", 0.25, 2],
    ["gpt-4.1", 2, 8],
    ["gpt-4.1-mini", 0.4, 1.6],
    ["o5", 10, 40],
    ["o4-mini", 1.1, 4.4],
    ["o3", 2, 8],
  ].map(([model, input, output]) => ({
    provider: "chatgpt",
    model: model as string,
    input: input as number,
    output: output as number,
    cacheRead: (input as number) / 4,
    cacheWrite: 0,
  })),
  ...[
    ["gemini-3-pro", 2, 12],
    ["gemini-3-flash", 0.3, 2.5],
    ["gemini-2.5-pro", 1.25, 10],
    ["gemini-2.5-flash", 0.3, 2.5],
    ["gemini-2.5-flash-lite", 0.1, 0.4],
  ].map(([model, input, output]) => ({
    provider: "gemini",
    model: model as string,
    input: input as number,
    output: output as number,
    cacheRead: (input as number) / 4,
    cacheWrite: 0,
  })),
  ...[
    ["deepseek-v4", 0.27, 1.1],
    ["deepseek-r2", 0.55, 2.19],
    ["qwen3-coder", 0.3, 1.2],
    ["qwen3-max", 1.2, 6],
    ["kimi-k2", 0.6, 2.5],
    ["glm-4.6", 0.6, 2.2],
    ["mistral-large-3", 2, 6],
    ["codestral-2", 0.3, 0.9],
  ].map(([model, input, output]) => ({
    provider: "openrouter",
    model: model as string,
    input: input as number,
    output: output as number,
    cacheRead: 0,
    cacheWrite: 0,
  })),
];
const catalogUpdatedAt = ago(6 * 24 * HOUR);
/** The administrator's overrides: one on a catalog model, one for a model the catalog lacks. */
let manualPrices: (Schemas["ModelPrice"] & { updatedAt: string })[] = [
  {
    provider: "claude",
    model: "claude-sonnet-5",
    input: 2.5,
    output: 12,
    cacheRead: 0.25,
    cacheWrite: 3,
    updatedAt: ago(2 * 24 * HOUR),
  },
  {
    provider: "local",
    model: "llama-4-70b",
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    updatedAt: ago(9 * 24 * HOUR),
  },
];
let priceCatalog: Schemas["PriceCatalog"] = {
  enabled: true,
  checkedAt: ago(26 * HOUR),
  changedAt: ago(6 * 24 * HOUR),
  models: CATALOG_PRICES.length,
  // A failed scheduled check, so the warning can be seen; "Refresh now" clears it.
  lastError: "GET https://catalog.example.com/models.json: 503 Service Unavailable",
};

const key = (price: { provider: string; model: string }) => `${price.provider}:${price.model}`;

function priceList(): Schemas["PriceList"] {
  const manual = new Map(manualPrices.map((price) => [key(price), price]));
  const catalogByKey = new Map(CATALOG_PRICES.map((price) => [key(price), price]));
  const rates = ({ input, output, cacheRead, cacheWrite }: Schemas["ModelPrice"]) => ({
    input,
    output,
    cacheRead,
    cacheWrite,
  });
  const entries: Schemas["PriceEntry"][] = [
    ...CATALOG_PRICES.filter((price) => !manual.has(key(price))).map((price) => ({
      ...price,
      source: "catalog" as const,
      updatedAt: catalogUpdatedAt,
    })),
    ...manualPrices.map(({ updatedAt, ...price }) => {
      const fromCatalog = catalogByKey.get(key(price));
      return {
        ...price,
        source: "manual" as const,
        updatedAt,
        ...(fromCatalog === undefined ? {} : { catalogRates: rates(fromCatalog) }),
      };
    }),
  ];
  entries.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  return { prices: entries, catalog: priceCatalog };
}

const notFound = () => HttpResponse.json({ code: "not_found", message: "" }, { status: 404 });

const unauthenticated = () => HttpResponse.json({ code: "unauthenticated", message: "no session" }, { status: 401 });

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
      id: email === "admin@example.com" ? ADMIN_ID : crypto.randomUUID(),
      kind: "human",
      displayName: email,
      email,
      role: email.startsWith("admin") ? "admin" : "user",
      restricted: email.startsWith("temp"),
      // "noaccess" in the address: no model allowed; "idp" too: the policy comes from groups.
      policy: email.includes("noaccess") ? [] : ["claude:*"],
      policySource: email.includes("idp") ? "idp" : "local",
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
  http.get("/api/admin/users", ({ response }) => response(200).json(users)),
  http.post("/api/admin/users", async ({ request, response }) => {
    const body = await request.json();
    if (body.email !== undefined && users.some((u) => u.email?.toLowerCase() === body.email?.toLowerCase())) {
      return response(409).json({ code: "email_taken", message: "" });
    }
    const user: Schemas["AdminUser"] = {
      id: crypto.randomUUID(),
      kind: body.kind,
      displayName: body.displayName,
      email: body.kind === "service" ? null : (body.email ?? null),
      role: body.role ?? "user",
      status: "active",
      policy: body.policy,
      policySource: "local",
      mustChangePassword: body.kind === "human" && body.signIn === "password",
      // Only working methods: an invited person has none until they claim the account.
      signIn: body.kind === "human" && body.signIn !== "oidc" ? ["password"] : [],
      invitationExpiresAt:
        body.kind === "human" && body.signIn === "oidc" ? new Date(Date.now() + 7 * 24 * HOUR).toISOString() : null,
      lastSeenAt: null,
      createdAt: new Date().toISOString(),
    };
    users = [...users, user];
    userTokens.set(user.id, []);
    return response(201).json(
      user.mustChangePassword
        ? {
            user,
            temporaryPassword: {
              password: `tmp-${crypto.randomUUID().slice(0, 13)}`,
              expiresAt: new Date(Date.now() + 72 * HOUR).toISOString(),
            },
          }
        : { user },
    );
  }),
  http.get("/api/admin/users/{userId}", ({ params, response }) => {
    const user = users.find((u) => u.id === params.userId);
    return user === undefined ? response.untyped(notFound()) : response(200).json(user);
  }),
  http.patch("/api/admin/users/{userId}", async ({ params, request, response }) => {
    const body = await request.json();
    const user = users.find((u) => u.id === params.userId);
    if (user === undefined) return response.untyped(notFound());
    if (user.id === me?.id && (body.status === "blocked" || body.role === "user")) {
      return response(409).json({ code: "self_lockout", message: "" });
    }
    if (body.policy !== undefined) {
      if (user.policySource === "idp") return response(409).json({ code: "policy_managed_by_idp", message: "" });
      const bad = preview(body.policy).errors[0];
      if (bad !== undefined) return response(422).json({ code: "invalid_rule", message: "", field: bad.rule });
    }
    const updated = { ...user, ...body };
    users = users.map((u) => (u.id === user.id ? updated : u));
    return response(200).json(updated);
  }),
  http.post("/api/admin/users/{userId}/password-reset", ({ params, response }) => {
    const user = users.find((u) => u.id === params.userId);
    if (user === undefined) return response.untyped(notFound());
    if (user.kind === "service") return response(409).json({ code: "not_local", message: "" });
    users = users.map((u) => (u.id === user.id ? { ...u, mustChangePassword: true } : u));
    return response(200).json({
      password: `tmp-${crypto.randomUUID().slice(0, 13)}`,
      expiresAt: new Date(Date.now() + 72 * HOUR).toISOString(),
    });
  }),
  http.post("/api/admin/users/{userId}/invitation", ({ params, response }) => {
    const user = users.find((u) => u.id === params.userId);
    if (user === undefined) return response.untyped(notFound());
    if (user.signIn.includes("oidc")) return response(409).json({ code: "already_linked", message: "" });
    if (user.kind === "service" || user.email == null)
      return response(409).json({ code: "not_invitable", message: "" });
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * HOUR).toISOString();
    users = users.map((u) => (u.id === user.id ? { ...u, invitationExpiresAt } : u));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/admin/users/{userId}/tokens", ({ params, response }) =>
    response(200).json(userTokens.get(params.userId) ?? []),
  ),
  http.post("/api/admin/users/{userId}/tokens", async ({ params, request, response }) => {
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
    userTokens.set(params.userId, [token, ...(userTokens.get(params.userId) ?? [])]);
    return response(201).json({ token, secret });
  }),
  http.delete("/api/admin/users/{userId}/tokens/{tokenId}", ({ params }) => {
    userTokens.set(
      params.userId,
      (userTokens.get(params.userId) ?? []).map((t) =>
        t.id === params.tokenId ? { ...t, revokedAt: new Date().toISOString() } : t,
      ),
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/admin/users/{userId}/activity", ({ params, response }) => {
    const user = users.find((u) => u.id === params.userId);
    return user === undefined ? response.untyped(notFound()) : response(200).json(activity(user));
  }),
  http.get("/api/admin/catalog", ({ response }) => response(200).json(CATALOG)),
  http.post("/api/admin/policy/preview", async ({ request, response }) =>
    response(200).json(preview((await request.json()).rules)),
  ),
  http.get("/api/admin/providers", ({ response }) => response(200).json(accounts)),
  http.post("/api/admin/providers/login/start", async ({ request, response }) => {
    const { provider } = await request.json();
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + LOGIN_LIFETIME_MS;
    loginSessions.set(sessionId, { provider, expiresAt });
    return response(201).json({
      sessionId,
      authURL: `https://auth.example.com/${provider}/authorize?client_id=example&state=${sessionId}`,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }),
  http.post("/api/admin/providers/login/complete", async ({ request, response }) => {
    const { sessionId, callbackURL } = await request.json();
    const session = loginSessions.get(sessionId);
    loginSessions.delete(sessionId);
    if (session === undefined || session.expiresAt < Date.now()) {
      return response(410).json({ code: "login_expired", message: "" });
    }
    if (!callbackURL.includes("code=")) return response(422).json({ code: "login_failed", message: "" });
    const n = accounts.length + 1;
    const account: Schemas["ProviderAccount"] = {
      id: `${session.provider}-new${n}@example.com`,
      provider: session.provider,
      label: `new${n}`,
      email: `new${n}@example.com`,
      status: "active",
      disabled: false,
      lastError: null,
      lastRefreshedAt: new Date().toISOString(),
      quota: [],
    };
    accounts = [...accounts, account];
    return response(201).json(account);
  }),
  http.patch("/api/admin/providers/{accountId}", async ({ params, request, response }) => {
    const { disabled } = await request.json();
    const account = accounts.find((a) => a.id === params.accountId);
    if (account === undefined) return response.untyped(notFound());
    const updated = { ...account, disabled, status: disabled ? "disabled" : "active" };
    accounts = accounts.map((a) => (a.id === account.id ? updated : a));
    return response(200).json(updated);
  }),
  http.delete("/api/admin/providers/{accountId}", ({ params }) => {
    accounts = accounts.filter((a) => a.id !== params.accountId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/admin/settings", ({ response }) => response(200).json(settings)),
  http.put("/api/admin/settings", async ({ request, response }) => {
    const body = await request.json();
    const yaml = body.yaml ?? yamlWith({ ...settings.fields, ...body.fields });
    const owned = OWNED_SETTINGS.find((key) => new RegExp(`^${key}:`, "m").test(yaml));
    if (owned !== undefined) return response(422).json({ code: "forbidden_setting", message: "", field: owned });
    const next = { yaml, fields: fieldsOf(yaml) };
    const diff = diffOf(settings.yaml, yaml);
    if (!body.dryRun) settings = next;
    return response(200).json({ applied: !body.dryRun, diff, settings: next });
  }),
  http.get("/api/admin/prices", ({ response }) => response(200).json(priceList())),
  http.put("/api/admin/prices", async ({ request, response }) => {
    const body = await request.json();
    const seen = new Set<string>();
    for (const [i, price] of body.entries()) {
      for (const rate of ["input", "output", "cacheRead", "cacheWrite"] as const) {
        if (!(price[rate] >= 0))
          return response(422).json({ code: "invalid_input", message: "", field: `[${i}].${rate}` });
      }
      if (seen.has(key(price))) return response(422).json({ code: "invalid_input", message: "", field: `[${i}]` });
      seen.add(key(price));
    }
    const now = new Date().toISOString();
    const before = new Map(manualPrices.map((price) => [key(price), price]));
    manualPrices = body.map((price) => {
      const old = before.get(key(price));
      const same =
        old !== undefined &&
        (["input", "output", "cacheRead", "cacheWrite"] as const).every((r) => old[r] === price[r]);
      return { ...price, updatedAt: same ? old.updatedAt : now };
    });
    return response(200).json(priceList());
  }),
  http.post("/api/admin/prices/refresh", ({ response }) => {
    if (!priceCatalog.enabled) return response(409).json({ code: "catalog_disabled", message: "" });
    priceCatalog = { ...priceCatalog, checkedAt: new Date().toISOString(), lastError: null };
    return response(200).json(priceList());
  }),
];

export async function startMockApi(): Promise<void> {
  await setupWorker(...handlers).start({ onUnhandledRequest: "bypass", quiet: true });
}
