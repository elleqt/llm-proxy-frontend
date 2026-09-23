# Repository Guidelines

## Project Overview

Web UI for **llm-proxy**, a self-hosted gateway that lets a team share Claude/ChatGPT subscriptions through personal API keys. This repo is the SPA only:

- **Cabinet** (`/`): sign in (password or OIDC), issue/revoke API keys, usage charts (tokens or USD), allowed models.
- **Connect** (`/connect`): config snippets for Claude Code, omp, curl.
- **Admin** (`/admin/*`): users + access policies (`<provider>:<model-glob>`, e.g. `chatgpt:*`), provider accounts + sign-in wizard, gateway settings, prices.

The backend (sibling repo `../backend`) owns the web API, the OpenAPI contract, and the docker compose files that deploy both. This repo is **public**: never write real hostnames, domains, IPs, realms, group names, or deployment paths into code, tests, comments, or fixtures. Use `example.com` and generic names.

## Architecture & Data Flow

Feature-sliced layers. **A layer imports only from layers below it**:

```
app/ > pages/ > features/ > entities/ > shared/
```

- Relative imports only (no path aliases). Only barrels: `src/shared/ui/index.ts`, `src/shared/i18n/index.ts`. Import other modules by file path.
- `pages/` are referenced only from `src/app/routes.tsx`. `features/` = single user actions (mutations, dialogs). `entities/` = TanStack Query `queryOptions` over the API.

```
main.tsx ── createQueryClient(navigate) + router ──> App (QueryClientProvider > I18nProvider > RouterProvider)
page ─> entity queryOptions (useQuery) / feature useMutation ─> unwrap(client.GET|POST(...)) ─> /api (cookie session)
```

Core mechanics:

- **API client** (`src/shared/api/client.ts`): openapi-fetch typed by generated `schema.d.ts`. Auth is the HttpOnly session cookie only (`credentials: "same-origin"`); no bearer tokens for `/api`. `unwrap(call)` returns data or throws `ApiError { status, code, field }`: 401 throws `UnauthenticatedError`, 403 `password_change_required` throws `PasswordChangeRequiredError`, no response throws status `0` / `network_error`. `AbortError` is rethrown untouched.
- **Global auth policy** (`src/app/queryClient.ts`): a 401 from any query or mutation (except code `invalid_credentials`) redirects to `/login` and runs `endSession`. A 403 `password_change_required` redirects to `/password`. **Every other error is rendered in place by the calling screen.** Queries retry up to 2 times, never on 4xx. A change of user in `["me"]` resets the cache; `features/session/session.ts` syncs sessions across tabs (BroadcastChannel).
- **Guards** (`src/app/guards.tsx`): `SessionGuard` redirects to `/login`, or to `/password` for restricted sessions. `AdminGuard` renders `NotFoundPage` for non-admins instead of redirecting, which hides the admin area (the backend also 404s `/api/admin/*`).
- **Pre-paint** (`src/app/prepaint.ts`): `PREPAINT_SCRIPT` is built with `Function.prototype.toString`. The `prepaintPlugin` in `vite.config.ts` injects it inline at the start of `<head>`, and it sets `data-theme`/`data-lang` before any CSS loads. It must stay self-contained (no imports or closures). The Docker build hashes it into the CSP.

## Key Directories

| Path | Purpose |
|---|---|
| `src/app/` | Router, guards, `Layout`, query client, pre-paint script |
| `src/pages/<screen>/` | `*Page.tsx` screens; `admin/{users,user,providers,settings}` plus shared `admin.module.css`, `ConfirmDialog`, `TemporaryPassword` |
| `src/features/<kebab-name>/` | `issue-token`, `revoke-token`, `policy-editor`, `provider-login`, `preferences`, `session`, `no-model-access` |
| `src/entities/<name>/` | `me.ts`, `tokens.ts`, `usage.ts`, `providers.ts`, `settings.ts`, ... (`queryOptions` + thin hooks) |
| `src/shared/api/` | `client.ts` (hand-written), `schema.d.ts` (**generated**) |
| `src/shared/i18n/` | `en.ts`, `ru.ts`, `i18n.tsx` (`useT`, `useErrorMessage`, `I18nProvider`) |
| `src/shared/ui/` | In-house component kit (no third-party UI library) |
| `src/shared/lib/` | `preferences.ts`, `money.ts`, `dates.ts`, `template.ts` |
| `src/shared/styles/` | `tokens.css` (theme CSS vars), `base.css` |
| `src/mocks/browser.ts` | Dev-only MSW in-memory backend |
| `src/test/` | Vitest setup, `renderApp`, MSW server + fixtures |
| `e2e/` | Playwright flows (`*.e2e.ts`) |
| `api/openapi.yaml` | Vendored contract (source of truth: `../backend/api/openapi.yaml`) |
| `nginx/` | Runtime config template, CSP hash step, real-IP entrypoint, header check |

## Development Commands

```sh
npm ci
npm run dev                         # Vite :5173; /api proxied to VITE_BACKEND_ORIGIN (default http://localhost:8081)
VITE_MOCK_API=1 npm run dev         # no backend: MSW mock. Any email + "password"; email starting "admin" = admin,
                                    # "temp" = restricted; "noaccess"/"idp"/"nomatch" in the email = policy edge cases
npm test                            # tsc -b && vitest run  (type check is the only lint gate)
npx vitest run src/pages/cabinet/CabinetPage.test.tsx -t "issuing"   # fast loop; skips tsc
npm run build                       # tsc -b && vite build -> dist/
npm run sync:contract               # copy ${BACKEND_DIR:-../backend}/api/openapi.yaml, then gen:api
npm run gen:api                     # regenerate src/shared/api/schema.d.ts
npm run e2e:stack                   # build backend+frontend compose stack from source, run Playwright, tear down
npm run e2e                         # Playwright only, against a stack already up at E2E_BASE_URL
```

Put local overrides in `.env.local` (gitignored), e.g. `VITE_BACKEND_ORIGIN=http://backend.example.com:8081`.

**When the backend API changes:** run `npm run sync:contract` and commit both `api/openapi.yaml` and `src/shared/api/schema.d.ts`. CI regenerates the types and fails on any diff.

## Code Conventions & Common Patterns

**Style.** There is no ESLint, Prettier, or EditorConfig; match the existing code: 2-space indent, double quotes, semicolons, trailing commas, ~120 columns. **Named exports only** (no `export default` in `src/`). Function components only. Components are `PascalCase.tsx` with a sibling `PascalCase.module.css`; logic modules are `camelCase.ts`. Comments are prose explaining *why*; exports get short JSDoc.

**TypeScript** (`tsconfig.app.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (use `import type` / inline `type`), `noUnusedLocals`/`Parameters`.

**API types are generated only.** Never hand-write request/response types and never edit `schema.d.ts`. Reference `components["schemas"]["X"]`, or re-export the type from the owning entity.

**Entity query** (`src/entities/user/me.ts`): short array key whose first segment names the resource.

```ts
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me", { signal })),
});
```

**Mutation** (`src/features/issue-token/IssueToken.tsx`): on success, invalidate the owning entity's key.

```ts
useMutation({
  mutationFn: (body: components["schemas"]["IssueTokenRequest"]) => unwrap(client.POST("/api/me/tokens", { body })),
  onSuccess: () => void queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey }),
  gcTime: 0, // + reset() after reading: secret-bearing responses must leave the mutation cache
});
```

**Errors and i18n.**
- Show API failures with `useErrorMessage(context?)`, which looks up `errorIn.<context>.<code>`, then `error.<code>`, then a generic fallback. **Never display the server's `message`.**
- Keep a `MessageKey` in state, not translated text, so the text follows a language switch.
- Every new key goes into **both** `en.ts` and `ru.ts` (flat, dot-namespaced: `page.admin.users.title`, `error.<code>`). `ru` is typed against the `en` keys.
- Interpolate with `fill(t("key"), { name })` from `shared/lib/template.ts`.

**Styling.**
- CSS Modules only; build new components in `shared/ui`, never add a UI library.
- Colors come from the `tokens.css` vars (`--bg --panel --line --fg --dim --accent --code`) across themes `auto|light|pink|dark`.
- Join classes with `[a, b].filter(Boolean).join(" ")` (no classnames library).
- `Button`: destructive actions are never `variant="primary"`; `busy` keeps the button focusable.

**Storage and secrets.**
- `localStorage` holds only `theme`, `lang`, `usageUnit`, all through `src/shared/lib/preferences.ts`.
- Never store a session id.
- A freshly issued key secret lives only in dialog state or the in-memory handoff in `src/entities/token/tokens.ts`. Never put it in the query cache or in storage.

**Units.** `formatUSD(lang, amount)` takes whole-dollar floats (not cents). `dates.ts` takes epoch ms; pass one stable `now` per render.

**Gotcha.** `ToastProvider`/`useToast` exist in `shared/ui` but are not mounted in `App`. Mount the provider before calling `useToast`.

**Commits.** [Conventional Commits](https://www.conventionalcommits.org): `type(scope)!: summary`, lowercase, type one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`: `fix(dev): ...`, `ci: ...`, `test(e2e): ...`. One type per subject. `main` accepts only squash-merged pull requests with green CI (`check`, `image`, `pr-title`); direct and force pushes are refused. Work on a branch and give the PR a title in that form: it becomes the commit on `main`, and `pr-title` refuses any other form.

## Important Files

- Entry: `index.html` loads `src/main.tsx`, then `src/app/App.tsx` and `src/app/routes.tsx`
- Policy hubs: `src/app/queryClient.ts`, `src/app/guards.tsx`, `src/shared/api/client.ts`, `src/features/session/session.ts`
- Config: `vite.config.ts` (plugins, `/api` proxy, embedded Vitest config), `tsconfig.{app,test,node}.json` (project references), `playwright.config.ts`
- Deploy/CI: `Dockerfile`, `nginx/default.conf.template`, `.github/workflows/ci.yml`; scripts in `scripts/`

## Runtime/Tooling Preferences

- **Node ≥ 22.22** (CI and Docker use Node 22), **npm** with `package-lock.json`; install with `npm ci`. Not Bun, pnpm, or yarn.
- Dependencies are **exact-pinned** (no `^`/`~`); keep new ones pinned and avoid adding dependencies.
- Env vars:
  - dev: `VITE_BACKEND_ORIGIN`, `VITE_MOCK_API=1`. The mock and its service worker never reach a build (`import.meta.env.DEV` gate, serve-only plugin).
  - container: `BACKEND_ORIGIN` (default `http://backend:8081`), `REAL_IP_FROM` (comma-separated CIDRs; invalid entries stop startup).
- **CSP invariants** (no `unsafe-*`):
  - The built `index.html` must contain **exactly one** inline `<script>` (the pre-paint one); `nginx/csp-hash.mjs` fails the build otherwise. Never add inline scripts or `<style>` blocks.
  - Security headers live only at server level in `nginx/default.conf.template` (a location-level `add_header` silently drops them); `nginx/check-headers.sh` verifies them.

## Testing & QA

- **Rule: every behavior gets an automated test**; only visual appearance is checked by eye. No coverage thresholds.
- **Vitest + jsdom + Testing Library.** No globals; import `describe/it/expect/vi` from `"vitest"`. Tests sit next to their source: `Foo.test.tsx` beside `Foo.tsx`, `*.test.ts` for pure logic.
- **`renderApp(path)`** (`src/test/render.tsx`) renders the real routes + real `createQueryClient` (retry delay 0) and returns `{ router, queryClient, ...render }`. Use it for page and feature tests.
- **MSW is the only network boundary** (`src/test/server.ts`):
  - `http` is openapi-msw typed by the contract.
  - `onUnhandledRequest: "error"`, so every endpoint the screen hits needs `server.use(http.get("/api/...", ({ response }) => response(200).json(fixtures.me())))`. Only `/api/me/models` has a default handler.
  - Use `fixtures.*` factories with overrides.
  - For errors the operation doesn't declare (the 401/403 conventions, 404, 409, 500, ...), use `response.untyped(errorResponse(status, { code, message: "" }))`, e.g. `errorResponse(409, { code: "catalog_disabled", message: "" })`.
- **Queries and interaction:**
  - Query with `getByRole`/`findByRole` + `{ name }` or `getByLabelText`; no test ids.
  - Drive interaction with `const user = userEvent.setup()`. Use `fireEvent` only alongside fake timers.
  - Assert text through the dictionary: `en["tokens.neverUsed"]`, not literals.
- **jsdom gaps:** mock `uplot` with `vi.hoisted` + `vi.mock("uplot", ...)` and stub `matchMedia`/`ResizeObserver`. Copy from `src/pages/cabinet/CabinetPage.test.tsx`.
- **Secrets:** assert `expect(cached(queryClient)).not.toContain(secret)` (`src/test/cache.ts`) and absence from the DOM after close.
- `src/test/setup.ts` resets handlers, `localStorage`, and the `<html>` theme/lang attributes after each test.
- **Contract guards:** `src/shared/api/schema.test.ts` (regenerated types must match the committed ones) and `client.test.ts` (error mapping, JSON content-type on body-less POST).
- **E2E (Playwright)** in `e2e/flows.e2e.ts`:
  - Runs serially (`workers: 1`); tests share state (bootstrap admin, then created user), so never reorder or parallelize them. Each test also asserts zero CSP violations.
  - Needs Docker with compose v2, a sibling `../backend` (or `BACKEND_DIR`), free ports 8080/8081, and Chromium (`npx playwright install chromium` or `E2E_CHROMIUM_PATH`).
  - Not part of `npm test` or CI.
- **CI** (`.github/workflows/ci.yml`) gates PRs on `npm run build`, `npm test`, a `gen:api` + `git diff --exit-code` drift check, and an image header check. E2E is not in CI.
