import { act, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { cached } from "../../../test/cache";
import { renderApp } from "../../../test/render";
import { fixtures, http, server, type Schemas } from "../../../test/server";

const AUTH_URL = "https://auth.example.com/authorize?state=example";
const CALLBACK = "http://localhost:54545/callback?code=example&state=example";
const LINK_LIFETIME_MS = 90_000;

afterEach(() => {
  vi.useRealTimers();
});

function providers(accounts: Schemas["ProviderAccount"][]) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/providers", ({ response }) => response(200).json(accounts)),
    http.post("/api/admin/providers/login/start", async ({ request, response }) =>
      response(201).json({
        sessionId: `session-${(await request.json()).provider}`,
        authURL: AUTH_URL,
        expiresAt: new Date(Date.now() + LINK_LIFETIME_MS).toISOString(),
      }),
    ),
  );
}

describe("add-account wizard", () => {
  it("goes from provider to sign-in link to the pasted address, lists the new account, and keeps link and address in no cache", async () => {
    const accounts: Schemas["ProviderAccount"][] = [];
    providers(accounts);
    let sent: Schemas["ProviderLoginCompleteRequest"] | undefined;
    server.use(
      http.post("/api/admin/providers/login/complete", async ({ request, response }) => {
        sent = await request.json();
        const account = fixtures.providerAccount({ provider: "chatgpt", label: "team", id: "chatgpt-team" });
        accounts.push(account);
        return response(201).json(account);
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
    const dialog = screen.getByRole("dialog", { name: en["providerLogin.title"] });
    await user.selectOptions(within(dialog).getByLabelText(en["providerLogin.provider"]), "chatgpt");
    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.getLink"] }));

    expect(
      await within(dialog).findByRole("textbox", { name: fill(en["providerLogin.link"], { provider: "chatgpt" }) }),
    ).toHaveTextContent(AUTH_URL);
    // A sign-in link, not a secret shown once: its own warning.
    expect(
      within(dialog).getByRole("group", { name: fill(en["providerLogin.link"], { provider: "chatgpt" }) }),
    ).toHaveAccessibleDescription(en["providerLogin.linkWarning"]);
    await waitFor(() => expect(cached(queryClient)).not.toContain(AUTH_URL));
    expect(within(dialog).getByRole("timer")).toHaveTextContent(
      fill(en["providerLogin.expiresIn"], { countdown: "1:30" }),
    );
    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.next"] }));

    await user.type(within(dialog).getByLabelText(en["providerLogin.callback"]), CALLBACK);
    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.complete"] }));

    expect(await screen.findByRole("dialog", { name: en["providerLogin.addedTitle"] })).toHaveTextContent(
      "team (chatgpt)",
    );
    expect(sent).toEqual({ sessionId: "session-chatgpt", callbackURL: CALLBACK });
    expect(await screen.findByRole("cell", { name: "team" })).toBeInTheDocument();
    expect(cached(queryClient)).not.toContain("code=example");
  });

  it("leaves nothing of an abandoned sign-in behind", async () => {
    providers([]);
    const user = userEvent.setup();
    const { queryClient } = renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
    await user.click(screen.getByRole("button", { name: en["providerLogin.getLink"] }));
    await screen.findByRole("timer");
    await user.click(screen.getByRole("button", { name: en["ui.cancel"] }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cached(queryClient)).not.toContain(AUTH_URL);
    await user.click(screen.getByRole("button", { name: en["providerLogin.open"] }));
    expect(screen.getByRole("button", { name: en["providerLogin.getLink"] })).toBeInTheDocument();
  });

  it("counts down and shows the expiry when it happens, with no submit left to fail", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    providers([]);
    let completions = 0;
    server.use(
      http.post("/api/admin/providers/login/complete", ({ response }) => {
        completions++;
        return response(410).json({ code: "login_expired", message: "" });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
    await user.click(screen.getByRole("button", { name: en["providerLogin.getLink"] }));
    const timer = await screen.findByRole("timer");
    await user.click(screen.getByRole("button", { name: en["providerLogin.next"] }));
    await user.type(screen.getByLabelText(en["providerLogin.callback"]), CALLBACK);

    act(() => vi.advanceTimersByTime(30_000));
    expect(timer).toHaveTextContent(fill(en["providerLogin.expiresIn"], { countdown: "1:00" }));

    act(() => vi.advanceTimersByTime(LINK_LIFETIME_MS - 30_000));
    // The wizard is over: its title says so, and no step is left.
    const dialog = screen.getByRole("dialog", { name: en["providerLogin.expiredTitle"] });
    expect(dialog).not.toHaveTextContent(fill(en["providerLogin.step"], { n: 3, of: 3 }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      en["providerLogin.expired"].split("{time}")[0] as string,
    );
    expect(within(dialog).queryByLabelText(en["providerLogin.callback"])).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: en["providerLogin.complete"] })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(AUTH_URL)).not.toBeInTheDocument();
    expect(completions).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.restart"] }));
    expect(within(dialog).getByRole("button", { name: en["providerLogin.getLink"] })).toBeInTheDocument();
  });

  it("shows login_busy in the first step, which stays usable", async () => {
    providers([]);
    let starts = 0;
    server.use(
      http.post("/api/admin/providers/login/start", ({ response }) => {
        starts++;
        return response(409).json({ code: "login_busy", message: "" });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
    const dialog = screen.getByRole("dialog", { name: en["providerLogin.title"] });
    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.getLink"] }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.login_busy"]);
    expect(within(dialog).queryByRole("timer")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.getLink"] }));
    await waitFor(() => expect(starts).toBe(2));
  });

  it("treats a login_expired refusal as the expiry", async () => {
    providers([]);
    server.use(
      http.post("/api/admin/providers/login/complete", ({ response }) =>
        response(410).json({ code: "login_expired", message: "" }),
      ),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
    await user.click(screen.getByRole("button", { name: en["providerLogin.getLink"] }));
    await user.click(await screen.findByRole("button", { name: en["providerLogin.next"] }));
    await user.type(screen.getByLabelText(en["providerLogin.callback"]), CALLBACK);
    await user.click(screen.getByRole("button", { name: en["providerLogin.complete"] }));

    expect(await screen.findByRole("button", { name: en["providerLogin.restart"] })).toBeInTheDocument();
    expect(screen.queryByLabelText(en["providerLogin.callback"])).not.toBeInTheDocument();
  });
});

describe("account table", () => {
  it("shows each quota window's used share and reset time", async () => {
    providers([
      fixtures.providerAccount({
        quota: [
          { window: "5h", usedRatio: 0.4, resetAt: new Date(Date.now() + 2 * 3_600_000 + 30 * 60_000).toISOString() },
          { window: "7d", usedRatio: 0.9, resetAt: null },
        ],
      }),
    ]);
    renderApp("/admin/providers");

    const fiveHours = await screen.findByRole("meter", { name: fill(en["providers.quotaLabel"], { window: "5h" }) });
    expect(fiveHours).toHaveAttribute("aria-valuenow", "40");
    expect(fiveHours.parentElement).toHaveTextContent(/40%.*resets in 2 h 30 min/);
    // The exact moment is a tooltip away.
    expect(within(fiveHours.parentElement as HTMLElement).getByText(/resets in/)).toHaveAttribute("title");
    const week = screen.getByRole("meter", { name: fill(en["providers.quotaLabel"], { window: "7d" }) });
    expect(week).toHaveAttribute("aria-valuenow", "90");
    expect(week.parentElement).not.toHaveTextContent("resets");
  });

  it("removes an account only once its name is typed", async () => {
    providers([fixtures.providerAccount({ label: "ops" })]);
    const removed: string[] = [];
    server.use(
      http.delete("/api/admin/providers/{accountId}", ({ params }) => {
        removed.push(params.accountId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: fill(en["providers.removeLabel"], { name: "ops" }) }));
    const dialog = screen.getByRole("dialog", { name: fill(en["providers.removeTitle"], { name: "ops" }) });
    const confirm = within(dialog).getByRole("button", { name: en["providers.removeConfirm"] });
    expect(within(dialog).getByRole("button", { name: en["ui.cancel"] })).toHaveFocus();

    const typed = within(dialog).getByLabelText(fill(en["admin.typeToConfirm"], { name: "ops" }));
    await user.type(typed, "OPS");
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(removed).toEqual([]);

    await user.clear(typed);
    await user.type(typed, "ops");
    await user.click(confirm);
    await waitFor(() => expect(removed).toEqual(["claude-ops@example.com"]));
  });

  it("disables after a confirmation naming the account, and enables at once", async () => {
    let account = fixtures.providerAccount({ label: "ops" });
    providers([]);
    const sent: boolean[] = [];
    server.use(
      http.get("/api/admin/providers", ({ response }) => response(200).json([account])),
      http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
        const { disabled } = await request.json();
        sent.push(disabled);
        account = { ...account, disabled };
        return response(200).json(account);
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: fill(en["providers.disableLabel"], { name: "ops" }) }));
    const dialog = screen.getByRole("dialog", { name: fill(en["providers.disableTitle"], { name: "ops" }) });
    await user.click(
      within(dialog).getByRole("button", { name: fill(en["providers.disableConfirm"], { name: "ops" }) }),
    );

    await user.click(await screen.findByRole("button", { name: fill(en["providers.enableLabel"], { name: "ops" }) }));
    await screen.findByRole("button", { name: fill(en["providers.disableLabel"], { name: "ops" }) });
    expect(sent).toEqual([true, false]);
  });
});

const COMPAT_KEY = "sk-compat-example-key";

function compatAccount(overrides: Partial<NonNullable<Schemas["ProviderAccount"]["compat"]>> = {}): Schemas["ProviderAccount"] {
  return fixtures.providerAccount({
    id: "openai-compatible-acme",
    provider: "acme",
    label: "acme",
    email: null,
    lastRefreshedAt: null,
    quota: [],
    compat: {
      name: "acme",
      baseURL: "https://api.example.com/v1",
      hasApiKey: true,
      models: [{ name: "model-a" }],
      ...overrides,
    },
  });
}

/** Opens the OpenAI-compatible form the one way there is: the "Add provider" wizard's last choice. */
async function openCompatForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
  const wizard = screen.getByRole("dialog", { name: en["providerLogin.title"] });
  await user.selectOptions(within(wizard).getByLabelText(en["providerLogin.provider"]), "openai-compatible");
  await user.click(within(wizard).getByRole("button", { name: en["providerLogin.continue"] }));
}

describe("OpenAI-compatible providers", () => {
  it("discovers models, warns about a pooled one, and adds the picked ones with the key, keeping it in no cache", async () => {
    const accounts: Schemas["ProviderAccount"][] = [];
    providers(accounts);
    let discovered: Schemas["CompatDiscoverRequest"] | undefined;
    let created: Schemas["CompatProviderRequest"] | undefined;
    server.use(
      http.post("/api/admin/providers/compat/discover", async ({ request, response }) => {
        discovered = await request.json();
        return response(200).json({ models: ["model-a", "model-b"], conflicts: { "model-b": ["other"] } });
      }),
      http.post("/api/admin/providers/compat", async ({ request, response }) => {
        created = await request.json();
        const account = compatAccount({ models: created.models });
        accounts.push(account);
        return response(201).json(account);
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp("/admin/providers");

    await openCompatForm(user);
    const dialog = screen.getByRole("dialog", { name: en["compat.titleAdd"] });
    // Typed in any case, stored in lower case: upstream matches names case-insensitively.
    await user.type(within(dialog).getByLabelText(en["compat.name"]), "AcMe");
    await user.type(within(dialog).getByLabelText(en["compat.baseURL"]), "https://api.example.com/v1");
    await user.type(within(dialog).getByLabelText(en["compat.apiKey"]), COMPAT_KEY);
    await user.click(within(dialog).getByRole("button", { name: en["compat.discover"] }));

    const pickB = await within(dialog).findByRole("checkbox", { name: fill(en["compat.serve"], { model: "model-b" }) });
    expect(discovered).toEqual({ baseURL: "https://api.example.com/v1", apiKey: COMPAT_KEY });
    // Discovered models wait to be picked.
    expect(pickB).not.toBeChecked();
    await user.click(pickB);
    expect(within(dialog).getByText(fill(en["compat.conflict"], { providers: "other" }))).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(fill(en["compat.aliasFor"], { model: "model-b" })), "b-fast");

    await user.click(within(dialog).getByRole("button", { name: en["compat.save"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(created).toEqual({
      name: "acme",
      baseURL: "https://api.example.com/v1",
      apiKey: COMPAT_KEY,
      models: [{ name: "model-b", alias: "b-fast" }],
    });
    expect(await screen.findByRole("cell", { name: "https://api.example.com/v1" })).toBeInTheDocument();
    expect(cached(queryClient)).not.toContain(COMPAT_KEY);
  });

  it("refuses to save without a picked model", async () => {
    providers([]);
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await openCompatForm(user);
    const dialog = screen.getByRole("dialog", { name: en["compat.titleAdd"] });
    await user.type(within(dialog).getByLabelText(en["compat.name"]), "acme");
    await user.type(within(dialog).getByLabelText(en["compat.baseURL"]), "https://api.example.com/v1");
    await user.click(within(dialog).getByRole("button", { name: en["compat.save"] }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(en["compat.pickModels"]);
  });

  it("edits keeping the stored key, and asks for it again at another base URL", async () => {
    providers([compatAccount()]);
    const updates: Schemas["CompatProviderUpdate"][] = [];
    const discovers: Schemas["CompatDiscoverRequest"][] = [];
    server.use(
      http.put("/api/admin/providers/compat/{accountId}", async ({ request, response }) => {
        const body = await request.json();
        updates.push(body);
        return response(200).json(compatAccount({ baseURL: body.baseURL, models: body.models }));
      }),
      http.post("/api/admin/providers/compat/discover", async ({ request, response }) => {
        discovers.push(await request.json());
        return response(200).json({ models: ["model-a"], conflicts: {} });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: fill(en["compat.editLabel"], { name: "acme" }) }));
    const dialog = screen.getByRole("dialog", { name: fill(en["compat.titleEdit"], { name: "acme" }) });
    expect(within(dialog).getByLabelText(en["compat.name"])).toHaveAttribute("readonly");

    // At the stored base URL, discovery may use the stored key.
    await user.click(within(dialog).getByRole("button", { name: en["compat.discover"] }));
    await waitFor(() => expect(discovers).toHaveLength(1));
    expect(discovers[0]).toEqual({ baseURL: "https://api.example.com/v1", accountId: "openai-compatible-acme" });

    // At another one it may not, and the key field says so.
    const baseURL = within(dialog).getByLabelText(en["compat.baseURL"]);
    await user.clear(baseURL);
    await user.type(baseURL, "https://other.example.com/v1");
    expect(within(dialog).getByLabelText(en["compat.apiKey"])).toHaveAccessibleDescription(en["compat.apiKeyMovedHint"]);
    await user.click(within(dialog).getByRole("button", { name: en["compat.discover"] }));
    await waitFor(() => expect(discovers).toHaveLength(2));
    expect(discovers[1]).toEqual({ baseURL: "https://other.example.com/v1" });

    await user.clear(baseURL);
    await user.type(baseURL, "https://api.example.com/v1");
    await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      baseURL: "https://api.example.com/v1",
      models: [{ name: "model-a" }],
      prefix: "",
      clearApiKey: false,
    });
  });

  it("shows the vendor's refusal of the key as its code's text", async () => {
    providers([]);
    server.use(
      http.post("/api/admin/providers/compat/discover", ({ response }) =>
        response(422).json({ code: "provider_auth_failed", message: "vendor said no", field: "apiKey" }),
      ),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await openCompatForm(user);
    const dialog = screen.getByRole("dialog", { name: en["compat.titleAdd"] });
    await user.type(within(dialog).getByLabelText(en["compat.baseURL"]), "https://api.example.com/v1");
    await user.click(within(dialog).getByRole("button", { name: en["compat.discover"] }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.provider_auth_failed"]);
  });
});
