import { act, fireEvent, screen, waitFor, within, type BoundFunctions, type queries } from "@testing-library/react";
import { HttpResponse } from "msw";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { cached } from "../../../test/cache";
import { renderApp } from "../../../test/render";
import { errorResponse, fixtures, http, server, type Schemas } from "../../../test/server";

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
    expect(await screen.findByRole("listitem", { name: "chatgpt team" })).toBeInTheDocument();
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

const editLabel = (name: string) => fill(en["providers.editLabel"], { name });

describe("account list", () => {
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

  it("lists subscriptions and OpenAI-compatible providers in groups of their own", async () => {
    providers([fixtures.providerAccount({ label: "ops", lastError: "refresh token rejected (401)" }), compatAccount()]);
    renderApp("/admin/providers");

    const subscriptions = await screen.findByRole("region", { name: en["providers.subscriptions"] });
    const ops = within(subscriptions).getByRole("listitem", { name: "claude ops" });
    // The account's last error, as a line under its name.
    expect(within(ops).getByText("refresh token rejected (401)")).toBeInTheDocument();
    expect(within(subscriptions).queryByText("https://api.example.com/v1")).not.toBeInTheDocument();

    const compat = screen.getByRole("region", { name: en["providers.compatGroup"] });
    expect(within(compat).getByRole("listitem", { name: "acme https://api.example.com/v1" })).toBeInTheDocument();
    expect(within(compat).queryByRole("listitem", { name: "claude ops" })).not.toBeInTheDocument();
  });

  it("renders no group for which there is no account", async () => {
    providers([compatAccount()]);
    renderApp("/admin/providers");

    expect(await screen.findByRole("region", { name: en["providers.compatGroup"] })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: en["providers.subscriptions"] })).not.toBeInTheDocument();
  });

  it("shows four models and the rest behind +N, opened from the keyboard or by a click", async () => {
    providers([
      compatAccount({
        models: [
          { name: "model-a" },
          { name: "model-b" },
          { name: "model-c", alias: "c-fast" },
          { name: "model-d" },
          { name: "model-e" },
          { name: "model-f" },
        ],
      }),
    ]);
    const user = userEvent.setup();
    renderApp("/admin/providers");

    const row = await screen.findByRole("listitem", { name: "acme https://api.example.com/v1" });
    const tags = within(within(row).getByRole("list", { name: en["compat.models"] })).getAllByRole("listitem");
    expect(tags.slice(0, 4).map((tag) => tag.textContent)).toEqual(["model-a", "model-b", "model-c → c-fast", "model-d"]);
    expect(tags).toHaveLength(5);
    expect(within(row).queryByText("model-e")).not.toBeVisible();
    const more = within(tags[4] as HTMLElement).getByRole("button", { name: fill(en["providers.moreModels"], { n: 2 }) });
    expect(more).toHaveTextContent("+2");
    const popover = () => screen.queryByRole("dialog", { name: fill(en["providers.moreModelsTitle"], { name: "acme" }) });
    expect(popover()).toBeNull();

    // Tab from the control before it.
    act(() => screen.getByRole("button", { name: en["providerLogin.open"] }).focus());
    await user.tab();
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(popover() as HTMLElement).getAllByRole("listitem").map((tag) => tag.textContent)).toEqual([
      "model-e",
      "model-f",
    ]);
    await user.keyboard("{Escape}");
    expect(popover()).toBeNull();
    await user.keyboard("{Enter}");
    expect(popover()).not.toBeNull();
    // Focus leaving closes it.
    await user.tab();
    expect(popover()).toBeNull();

    await user.click(more);
    expect(popover()).not.toBeNull();
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

  it("removes from inside the drawer: the confirmation opens on top, and focus returns to the list", async () => {
    let accounts = [
      fixtures.providerAccount({ label: "ops" }),
      fixtures.providerAccount({ id: "claude-spare@example.com", label: "spare", email: null }),
    ];
    providers([]);
    const removed: string[] = [];
    server.use(
      http.get("/api/admin/providers", ({ response }) => response(200).json(accounts)),
      http.delete("/api/admin/providers/{accountId}", ({ params }) => {
        removed.push(params.accountId);
        accounts = accounts.filter((a) => a.id !== params.accountId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("ops") }));
    const drawer = screen.getByRole("dialog", { name: "claude · ops" });
    await user.click(within(drawer).getByRole("button", { name: fill(en["providers.removeLabel"], { name: "ops" }) }));

    const confirm = screen.getByRole("dialog", { name: fill(en["providers.removeTitle"], { name: "ops" }) });
    // Nested: the drawer stays open beneath, inert while the confirmation is on top.
    expect(drawer).toBeInTheDocument();
    expect(drawer.parentElement).toHaveAttribute("inert");
    expect(within(confirm).getByRole("button", { name: en["ui.cancel"] })).toHaveFocus();
    await user.type(within(confirm).getByLabelText(fill(en["admin.typeToConfirm"], { name: "ops" })), "ops");
    await user.click(within(confirm).getByRole("button", { name: en["providers.removeConfirm"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(removed).toEqual(["claude-ops@example.com"]);
    expect(screen.queryByRole("listitem", { name: "claude ops" })).not.toBeInTheDocument();
    expect(document.activeElement).toContainElement(screen.getByRole("listitem", { name: "claude spare" }));
  });

  it("disables after a confirmation naming the account, and enables at once", async () => {
    let account = fixtures.providerAccount({ label: "ops" });
    providers([]);
    const sent: boolean[] = [];
    server.use(
      http.get("/api/admin/providers", ({ response }) => response(200).json([account])),
      http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
        const { disabled = false } = await request.json();
        sent.push(disabled);
        account = { ...account, disabled };
        return response(200).json(account);
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    // The switch's label is hidden from sight, not from its name.
    const toggle = await screen.findByRole("switch", { name: fill(en["providers.enabledLabel"], { name: "ops" }) });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    const dialog = screen.getByRole("dialog", { name: fill(en["providers.disableTitle"], { name: "ops" }) });
    expect(sent).toEqual([]);
    await user.click(
      within(dialog).getByRole("button", { name: fill(en["providers.disableConfirm"], { name: "ops" }) }),
    );

    await waitFor(() => expect(toggle).not.toBeChecked());
    await user.click(toggle);
    // Enabling asks nothing.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(toggle).toBeChecked());
    expect(sent).toEqual([true, false]);
  });

  it("shows each account's proxy, its address without credentials", async () => {
    providers([
      fixtures.providerAccount({ id: "a", label: "a" }),
      fixtures.providerAccount({ id: "b", label: "b", proxy: { mode: "direct" } }),
      fixtures.providerAccount({ id: "c", label: "c", proxy: { mode: "custom", url: "http://proxy.example.com:3128", hasCredentials: true } }),
    ]);
    renderApp("/admin/providers");

    const a = await screen.findByRole("listitem", { name: "claude a" });
    expect(within(a).getByText(en["proxy.inherit"])).toBeInTheDocument();
    const b = screen.getByRole("listitem", { name: "claude b" });
    expect(within(b).getByText(en["proxy.direct"])).toBeInTheDocument();
    for (const row of [a, b]) expect(within(row).queryByRole("img", { name: en["proxy.withCredentials"] })).toBeNull();
    const c = screen.getByRole("listitem", { name: "claude c" });
    expect(within(c).getByText("HTTP")).toBeInTheDocument();
    expect(within(c).getByText("proxy.example.com:3128")).toBeInTheDocument();
    expect(within(c).getByRole("img", { name: en["proxy.withCredentials"] })).toBeInTheDocument();
  });

  it("sets an own proxy, keeps the typed URL in no cache, and shows a refused URL on its field", async () => {
    let account = fixtures.providerAccount({ label: "ops" });
    providers([]);
    const sent: Schemas["AccountProxyInput"][] = [];
    server.use(
      http.get("/api/admin/providers", ({ response }) => response(200).json([account])),
      http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
        const body = await request.json();
        if (body.proxy !== undefined) sent.push(body.proxy);
        if (body.proxy?.url === "ftp://bad.example.com") {
          return response(422).json({ code: "invalid_input", message: "", field: "proxy.url" });
        }
        account = { ...account, proxy: { mode: "custom", url: "http://proxy.example.com:3128", hasCredentials: true } };
        return response(200).json(account);
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("ops") }));
    const dialog = screen.getByRole("dialog", { name: "claude · ops" });
    expect(within(dialog).getByRole("button", { name: en["providers.save"] })).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: en["proxy.ownSegment"] }));
    await user.type(within(dialog).getByLabelText(en["proxy.url"]), "ftp://bad.example.com");
    await user.click(within(dialog).getByRole("button", { name: en["providers.save"] }));
    expect(await within(dialog).findByText(en["error.invalid_input"])).toBeInTheDocument();
    expect(within(dialog).getByLabelText(en["proxy.url"])).toHaveAccessibleDescription(
      expect.stringContaining(en["error.invalid_input"]),
    );

    const url = within(dialog).getByLabelText(en["proxy.url"]);
    await user.clear(url);
    await user.type(url, "http://ops:proxy-pass@proxy.example.com:3128");
    await user.click(within(dialog).getByRole("button", { name: en["providers.save"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sent).toEqual([
      { mode: "custom", url: "ftp://bad.example.com" },
      { mode: "custom", url: "http://ops:proxy-pass@proxy.example.com:3128" },
    ]);
    const row = screen.getByRole("listitem", { name: "claude ops" });
    expect(await within(row).findByText("proxy.example.com:3128")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: en["proxy.withCredentials"] })).toBeInTheDocument();
    expect(cached(queryClient)).not.toContain("proxy-pass");
  });

  it("keeps a stored own proxy until a new URL is typed, and switches to direct without one", async () => {
    let account = fixtures.providerAccount({ label: "ops", proxy: { mode: "custom", url: "http://proxy.example.com:3128", hasCredentials: true } });
    providers([]);
    const sent: Schemas["AccountProxyInput"][] = [];
    server.use(
      http.get("/api/admin/providers", ({ response }) => response(200).json([account])),
      http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
        const { proxy } = await request.json();
        if (proxy !== undefined) sent.push(proxy);
        account = { ...account, proxy: { mode: "direct" } };
        return response(200).json(account);
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("ops") }));
    const dialog = screen.getByRole("dialog", { name: "claude · ops" });
    // The stored proxy shows as its line, kept while it shows: no URL field to fill.
    const proxy = within(within(dialog).getByRole("region", { name: en["proxy.column"] }));
    expect(proxy.getByRole("radio", { name: en["proxy.ownSegment"] })).toBeChecked();
    expect(proxy.getByText("proxy.example.com:3128")).toBeInTheDocument();
    expect(proxy.getByRole("img", { name: en["proxy.withCredentials"] })).toBeInTheDocument();
    expect(proxy.queryByLabelText(en["proxy.url"])).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: en["providers.save"] })).toBeDisabled();
    await user.click(proxy.getByRole("radio", { name: en["proxy.direct"] }));
    await user.click(within(dialog).getByRole("button", { name: en["providers.save"] }));

    await waitFor(() => expect(sent).toEqual([{ mode: "direct" }]));
  });

  it("asks before a stray close drops a typed proxy URL, by Escape or by a click beside the drawer", async () => {
    providers([
      fixtures.providerAccount({ label: "ops", proxy: { mode: "custom", url: "http://proxy.example.com:3128", hasCredentials: true } }),
    ]);
    const sent: unknown[] = [];
    server.use(
      http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
        sent.push(await request.json());
        return response(200).json(fixtures.providerAccount());
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("ops") }));
    const drawer = screen.getByRole("dialog", { name: "claude · ops" });
    await user.click(within(drawer).getByRole("button", { name: en["proxy.replace"] }));
    await user.type(within(drawer).getByLabelText(en["proxy.url"]), "http://ops:proxy-pass@new.example.com:8080");

    await user.keyboard("{Escape}");
    await user.click(within(screen.getByRole("dialog", { name: en["ui.discardTitle"] })).getByRole("button", { name: en["ui.keepEditing"] }));
    expect(screen.queryByRole("dialog", { name: en["ui.discardTitle"] })).not.toBeInTheDocument();
    expect(within(drawer).getByLabelText(en["proxy.url"])).toHaveValue("http://ops:proxy-pass@new.example.com:8080");

    fireEvent.mouseDown(drawer.parentElement as HTMLElement);
    await user.click(within(screen.getByRole("dialog", { name: en["ui.discardTitle"] })).getByRole("button", { name: en["ui.keepEditing"] }));
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByLabelText(en["proxy.url"])).toHaveValue("http://ops:proxy-pass@new.example.com:8080");

    fireEvent.mouseDown(drawer.parentElement as HTMLElement);
    await user.click(within(screen.getByRole("dialog", { name: en["ui.discardTitle"] })).getByRole("button", { name: en["ui.discard"] }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sent).toEqual([]);
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

/** Opens the OpenAI-compatible drawer the one way there is to add one: the "Add provider" wizard's last choice. */
async function openCompatForm(user: UserEvent) {
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
    await user.click(within(dialog).getByRole("button", { name: en["compat.refresh"] }));

    const pickB = await within(dialog).findByRole("checkbox", { name: fill(en["compat.serve"], { model: "model-b" }) });
    expect(discovered).toEqual({ baseURL: "https://api.example.com/v1", apiKey: COMPAT_KEY, proxy: { mode: "inherit" } });
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
      proxy: { mode: "inherit" },
    });
    expect(await screen.findByRole("listitem", { name: "acme https://api.example.com/v1" })).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
    const dialog = screen.getByRole("dialog", { name: "acme" });
    // The name cannot change: it is the drawer's heading, not a field.
    expect(within(dialog).queryByLabelText(en["compat.name"])).not.toBeInTheDocument();

    // At the stored base URL, discovery may use the stored key.
    await user.click(within(dialog).getByRole("button", { name: en["compat.refresh"] }));
    await waitFor(() => expect(discovers).toHaveLength(1));
    expect(discovers[0]).toEqual({
      baseURL: "https://api.example.com/v1",
      accountId: "openai-compatible-acme",
      proxy: { mode: "inherit" },
    });

    // At another one it may not, and the key's line says so.
    const baseURL = within(dialog).getByLabelText(en["compat.baseURL"]);
    await user.clear(baseURL);
    await user.type(baseURL, "https://other.example.com/v1");
    expect(within(dialog).getByLabelText(en["compat.apiKey"])).toHaveAccessibleDescription(en["compat.apiKeyMovedHint"]);
    await user.click(within(dialog).getByRole("button", { name: en["compat.refresh"] }));
    await waitFor(() => expect(discovers).toHaveLength(2));
    expect(discovers[1]).toEqual({ baseURL: "https://other.example.com/v1", proxy: { mode: "inherit" } });

    await user.clear(baseURL);
    await user.type(baseURL, "https://api.example.com/v1");
    // Save waits for a change.
    const save = within(dialog).getByRole("button", { name: en["compat.saveEdit"] });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText(en["compat.prefix"]), "acme");
    await user.click(save);

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      baseURL: "https://api.example.com/v1",
      models: [{ name: "model-a" }],
      prefix: "acme",
      clearApiKey: false,
    });
  });

  it("adds a provider behind its own proxy, and discovers through it", async () => {
    const accounts: Schemas["ProviderAccount"][] = [];
    providers(accounts);
    let discovered: Schemas["CompatDiscoverRequest"] | undefined;
    let created: Schemas["CompatProviderRequest"] | undefined;
    server.use(
      http.post("/api/admin/providers/compat/discover", async ({ request, response }) => {
        discovered = await request.json();
        return response(200).json({ models: ["model-a"], conflicts: {} });
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
    await user.type(within(dialog).getByLabelText(en["compat.name"]), "acme");
    await user.type(within(dialog).getByLabelText(en["compat.baseURL"]), "https://api.example.com/v1");
    await user.click(within(dialog).getByRole("radio", { name: en["proxy.ownSegment"] }));
    await user.type(within(dialog).getByLabelText(en["proxy.url"]), "socks5://ops:proxy-pass@proxy.example.com:1080");
    await user.click(within(dialog).getByRole("button", { name: en["compat.refresh"] }));
    await user.click(await within(dialog).findByRole("checkbox", { name: fill(en["compat.serve"], { model: "model-a" }) }));
    await user.click(within(dialog).getByRole("button", { name: en["compat.save"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const proxy = { mode: "custom", url: "socks5://ops:proxy-pass@proxy.example.com:1080" };
    expect(discovered).toEqual({ baseURL: "https://api.example.com/v1", proxy });
    expect(created).toEqual({ name: "acme", baseURL: "https://api.example.com/v1", models: [{ name: "model-a" }], proxy });
    expect(cached(queryClient)).not.toContain("proxy-pass");
  });

  it("edits a provider behind a stored own proxy: discovery uses it, a save keeps it, a new URL replaces it", async () => {
    const stored = { mode: "custom" as const, url: "http://proxy.example.com:3128", hasCredentials: true };
    providers([{ ...compatAccount({ hasApiKey: false }), proxy: stored }]);
    const updates: Schemas["CompatProviderUpdate"][] = [];
    const discovers: Schemas["CompatDiscoverRequest"][] = [];
    server.use(
      http.put("/api/admin/providers/compat/{accountId}", async ({ request, response }) => {
        const body = await request.json();
        updates.push(body);
        return response(200).json({ ...compatAccount({ hasApiKey: false }), proxy: stored });
      }),
      http.post("/api/admin/providers/compat/discover", async ({ request, response }) => {
        discovers.push(await request.json());
        return response(200).json({ models: ["model-a"], conflicts: {} });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
    const dialog = screen.getByRole("dialog", { name: "acme" });
    await user.click(within(dialog).getByRole("button", { name: en["compat.refresh"] }));
    await waitFor(() => expect(discovers).toHaveLength(1));
    expect(discovers[0]).toEqual({ baseURL: "https://api.example.com/v1", accountId: "openai-compatible-acme" });

    // Save waits for a change; one that leaves the proxy alone.
    await user.type(within(dialog).getByLabelText(en["compat.prefix"]), "acme");
    await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).not.toHaveProperty("proxy");

    await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
    const again = screen.getByRole("dialog", { name: "acme" });
    await user.click(
      within(within(again).getByRole("region", { name: en["proxy.column"] })).getByRole("button", { name: en["proxy.replace"] }),
    );
    await user.type(within(again).getByLabelText(en["proxy.url"]), "http://new.example.com:8080");
    await user.click(within(again).getByRole("button", { name: en["compat.saveEdit"] }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1]?.proxy).toEqual({ mode: "custom", url: "http://new.example.com:8080" });
  });

  it("asks for the key again before discovering at another base URL behind a stored own proxy", async () => {
    const stored = { mode: "custom" as const, url: "http://proxy.example.com:3128", hasCredentials: true };
    providers([{ ...compatAccount({ hasApiKey: true }), proxy: stored }]);
    const discovers: Schemas["CompatDiscoverRequest"][] = [];
    server.use(
      http.post("/api/admin/providers/compat/discover", async ({ request, response }) => {
        discovers.push(await request.json());
        return response(200).json({ models: ["model-a"], conflicts: {} });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
    const dialog = screen.getByRole("dialog", { name: "acme" });
    const baseURL = within(dialog).getByLabelText(en["compat.baseURL"]);
    await user.clear(baseURL);
    await user.type(baseURL, "https://other.example.com/v1");

    // The stored proxy would be used through the account, but the stored key does not follow the URL.
    const discover = within(dialog).getByRole("button", { name: en["compat.refresh"] });
    expect(discover).toBeDisabled();
    expect(within(dialog).getByLabelText(en["compat.apiKey"])).toHaveAccessibleDescription(en["compat.apiKeyMovedHint"]);

    await user.click(
      within(within(dialog).getByRole("group", { name: en["compat.apiKey"] })).getByRole("button", { name: en["compat.keyReplace"] }),
    );
    await user.type(within(dialog).getByLabelText(en["compat.apiKey"]), COMPAT_KEY);
    expect(discover).toBeEnabled();
    await user.click(discover);
    await waitFor(() => expect(discovers).toHaveLength(1));
    expect(discovers[0]).toEqual({
      baseURL: "https://other.example.com/v1",
      apiKey: COMPAT_KEY,
      accountId: "openai-compatible-acme",
    });
  });

  it("needs a key or a typed proxy URL to discover while the stored key is removed behind a stored own proxy", async () => {
    const stored = { mode: "custom" as const, url: "http://proxy.example.com:3128", hasCredentials: true };
    providers([{ ...compatAccount({ hasApiKey: true }), proxy: stored }]);
    const discovers: Schemas["CompatDiscoverRequest"][] = [];
    server.use(
      http.post("/api/admin/providers/compat/discover", async ({ request, response }) => {
        discovers.push(await request.json());
        return response(200).json({ models: ["model-a"], conflicts: {} });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
    const dialog = screen.getByRole("dialog", { name: "acme" });
    const discover = within(dialog).getByRole("button", { name: en["compat.refresh"] });
    expect(discover).toBeEnabled();
    expect(within(dialog).queryByText(en["compat.discoverNeedsKey"])).not.toBeInTheDocument();

    await user.click(
      within(within(dialog).getByRole("group", { name: en["compat.apiKey"] })).getByRole("button", { name: en["compat.keyRemove"] }),
    );
    expect(discover).toBeDisabled();
    expect(within(dialog).getByText(en["compat.discoverNeedsKey"])).toBeInTheDocument();

    await user.click(
      within(within(dialog).getByRole("region", { name: en["proxy.column"] })).getByRole("button", { name: en["proxy.replace"] }),
    );
    await user.type(within(dialog).getByLabelText(en["proxy.url"]), "http://new.example.com:8080");
    expect(discover).toBeEnabled();
    expect(within(dialog).queryByText(en["compat.discoverNeedsKey"])).not.toBeInTheDocument();
    await user.click(discover);
    await waitFor(() => expect(discovers).toHaveLength(1));
    expect(discovers[0]).toEqual({
      baseURL: "https://api.example.com/v1",
      proxy: { mode: "custom", url: "http://new.example.com:8080" },
    });
    expect(discovers[0]).not.toHaveProperty("accountId");
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
    await user.click(within(dialog).getByRole("button", { name: en["compat.refresh"] }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.provider_auth_failed"]);
  });

  describe("reasoning levels", () => {
    const DEFAULTS = fixtures.compatDefaults().reasoningLevels;
    // The hint's `code` marks are rendered as code, so its accessible text has none.
    const HINT = en["compat.levelsHint"].replaceAll("`", "");

    /** Opens the drawer's Advanced section; its reasoning levels block, once the default set is in. */
    async function openLevels(user: UserEvent, dialog: HTMLElement) {
      await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) }));
      return within(await within(dialog).findByRole("region", { name: en["compat.levels"] }));
    }
    const pressed = (block: BoundFunctions<typeof queries>, level: string) =>
      block.getByRole("button", { name: level }).getAttribute("aria-pressed");

    /** Opens the drawer of the one stored provider and its levels block; updates land in `updates`. */
    async function editForm(account: Schemas["ProviderAccount"]) {
      providers([account]);
      const updates: Schemas["CompatProviderUpdate"][] = [];
      server.use(
        http.put("/api/admin/providers/compat/{accountId}", async ({ request, response }) => {
          updates.push(await request.json());
          return response(200).json(account);
        }),
      );
      const user = userEvent.setup();
      renderApp("/admin/providers");
      await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
      const dialog = screen.getByRole("dialog", { name: "acme" });
      const block = await openLevels(user, dialog);
      return { user, dialog, block, updates };
    }

    it("start from the default set under the hint, and a new provider's models are sent without them", async () => {
      providers([]);
      let created: Schemas["CompatProviderRequest"] | undefined;
      server.use(
        http.post("/api/admin/providers/compat", async ({ request, response }) => {
          created = await request.json();
          return response(201).json(compatAccount({ models: created.models }));
        }),
      );
      const user = userEvent.setup();
      renderApp("/admin/providers");

      await openCompatForm(user);
      const dialog = screen.getByRole("dialog", { name: en["compat.titleAdd"] });
      await user.type(within(dialog).getByLabelText(en["compat.name"]), "acme");
      await user.type(within(dialog).getByLabelText(en["compat.baseURL"]), "https://api.example.com/v1");
      await user.type(within(dialog).getByLabelText(en["compat.addModel"]), "model-a");
      await user.click(within(dialog).getByRole("button", { name: en["compat.addModelButton"] }));

      const block = await openLevels(user, dialog);
      expect(block.getByRole("button", { name: en["compat.levelsHelp"] })).toHaveAccessibleDescription(HINT);
      for (const level of DEFAULTS) expect(pressed(block, level)).toBe("true");
      // Ollama refuses `auto`: offered, but not in the default set.
      expect(pressed(block, "auto")).toBe("false");
      expect(block.getByText(en["compat.levelsDefault"])).toBeInTheDocument();
      expect(block.getByRole("button", { name: en["compat.levelsReset"] })).toBeDisabled();

      await user.click(within(dialog).getByRole("button", { name: en["compat.save"] }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(created?.models).toEqual([{ name: "model-a" }]);
    });

    it("become an own list once a level is unchecked", async () => {
      const { user, dialog, block, updates } = await editForm(compatAccount());

      await user.click(block.getByRole("button", { name: "max" }));
      expect(block.getByText(en["compat.levelsOwn"])).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([{ name: "model-a", reasoningLevels: DEFAULTS.filter((l) => l !== "max") }]);
    });

    it("go back to the default set on Reset, and are then not sent", async () => {
      const { user, dialog, block, updates } = await editForm(compatAccount());

      await user.click(block.getByRole("button", { name: "max" }));
      await user.click(block.getByRole("button", { name: en["compat.levelsReset"] }));
      expect(pressed(block, "max")).toBe("true");
      expect(block.getByText(en["compat.levelsDefault"])).toBeInTheDocument();
      // Back where it started: Save waits for another change.
      await user.type(within(dialog).getByLabelText(en["compat.prefix"]), "acme");
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([{ name: "model-a" }]);
    });

    it("take an own value, checked and lower-cased, and refuse a malformed one in place", async () => {
      const { user, dialog, block, updates } = await editForm(compatAccount());
      await user.click(block.getByRole("button", { name: `+ ${en["compat.levelsAdd"]}` }));
      const own = block.getByLabelText(en["compat.levelsAdd"]);

      await user.type(own, "9x");
      await user.click(block.getByRole("button", { name: en["compat.levelsAddButton"] }));
      expect(own).toHaveAccessibleDescription(en["compat.levelsInvalid"]);
      expect(block.queryByRole("button", { name: "9x" })).not.toBeInTheDocument();

      await user.clear(own);
      await user.type(own, " Ultra {Enter}");
      expect(pressed(block, "ultra")).toBe("true");
      // Taken: the field closes, nothing left in it.
      expect(block.queryByLabelText(en["compat.levelsAdd"])).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([{ name: "model-a", reasoningLevels: [...DEFAULTS, "ultra"] }]);
    });

    it("show a model's own list as such, and send it back unchanged", async () => {
      const { user, dialog, block, updates } = await editForm(
        compatAccount({ models: [{ name: "model-a", reasoningLevels: ["none", "high", "ultra"] }] }),
      );

      for (const level of ["none", "high", "ultra"]) expect(pressed(block, level)).toBe("true");
      expect(pressed(block, "max")).toBe("false");
      expect(block.getByText(en["compat.levelsOwn"])).toBeInTheDocument();
      expect(block.getByRole("button", { name: en["compat.levelsReset"] })).toBeEnabled();
      // Save waits for a change; one elsewhere in the drawer.
      await user.type(within(dialog).getByLabelText(en["compat.prefix"]), "acme");
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([{ name: "model-a", reasoningLevels: ["none", "high", "ultra"] }]);
    });

    it("leave the models' different lists unchecked, and an untouched block sends each model its own", async () => {
      const { user, dialog, block, updates } = await editForm(
        compatAccount({ models: [{ name: "model-a", reasoningLevels: ["low"] }, { name: "model-b" }] }),
      );

      expect(block.getByText(en["compat.levelsMixed"])).toBeInTheDocument();
      for (const level of ["low", "medium", "high"]) expect(pressed(block, level)).toBe("false");
      await user.type(within(dialog).getByLabelText(en["compat.prefix"]), "acme");
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([{ name: "model-a", reasoningLevels: ["low"] }, { name: "model-b" }]);
    });

    it("give every picked model the list once touched", async () => {
      const { user, dialog, block, updates } = await editForm(
        compatAccount({ models: [{ name: "model-a", reasoningLevels: ["low"] }, { name: "model-b" }] }),
      );

      await user.click(block.getByRole("button", { name: "low" }));
      await user.click(block.getByRole("button", { name: "high" }));
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([
        { name: "model-a", reasoningLevels: ["low", "high"] },
        { name: "model-b", reasoningLevels: ["low", "high"] },
      ]);
    });

    it("refuse to save with none checked", async () => {
      const { user, dialog, block, updates } = await editForm(
        compatAccount({ models: [{ name: "model-a", reasoningLevels: ["none", "high"] }] }),
      );

      await user.click(block.getByRole("button", { name: "none" }));
      await user.click(block.getByRole("button", { name: "high" }));
      await user.click(within(dialog).getByRole("button", { name: en["compat.saveEdit"] }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent(en["compat.pickLevels"]);
      expect(updates).toEqual([]);

      // Checking a level again takes the refusal away.
      await user.click(block.getByRole("button", { name: "high" }));
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("hold Save while the default set loads", async () => {
      let release: () => void = () => {};
      const loaded = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get("/api/admin/providers/compat/defaults", async ({ response }) => {
          await loaded;
          return response(200).json(fixtures.compatDefaults());
        }),
      );
      providers([compatAccount()]);
      const updates: Schemas["CompatProviderUpdate"][] = [];
      server.use(
        http.put("/api/admin/providers/compat/{accountId}", async ({ request, response }) => {
          updates.push(await request.json());
          return response(200).json(compatAccount());
        }),
      );
      const user = userEvent.setup();
      renderApp("/admin/providers");
      await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
      const dialog = screen.getByRole("dialog", { name: "acme" });
      await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) }));

      expect(within(dialog).getByText(en["compat.levelsLoading"]).closest("[role=status]")).not.toBeNull();
      // A change to save, so only the loading holds Save back.
      await user.type(within(dialog).getByLabelText(en["compat.prefix"]), "acme");
      const save = within(dialog).getByRole("button", { name: en["compat.saveEdit"] });
      expect(save).toHaveAttribute("aria-busy", "true");
      await user.click(save);
      expect(updates).toEqual([]);

      act(() => release());
      await within(dialog).findByRole("region", { name: en["compat.levels"] });
      await user.click(save);
      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.models).toEqual([{ name: "model-a" }]);
    });

    it("say once that the default set failed to load, and keep Save from sending", async () => {
      server.use(
        http.get("/api/admin/providers/compat/defaults", ({ response }) =>
          response.untyped(errorResponse(500, { code: "internal", message: "boom" })),
        ),
      );
      providers([compatAccount({ models: [{ name: "model-a" }, { name: "model-b" }] })]);
      const updates: Schemas["CompatProviderUpdate"][] = [];
      server.use(
        http.put("/api/admin/providers/compat/{accountId}", async ({ request, response }) => {
          updates.push(await request.json());
          return response(200).json(compatAccount());
        }),
      );
      const user = userEvent.setup();
      renderApp("/admin/providers");
      await user.click(await screen.findByRole("button", { name: editLabel("acme") }));
      const dialog = screen.getByRole("dialog", { name: "acme" });

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.internal"]);
      // Two picked models, one alert: the failure belongs to the form, not to each row.
      expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
      const save = within(dialog).getByRole("button", { name: en["compat.saveEdit"] });
      expect(save).toBeDisabled();
      await user.click(save);
      expect(updates).toEqual([]);
    });
  });
});
