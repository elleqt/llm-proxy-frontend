import { act, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
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
  it("goes from provider to sign-in link to the pasted address, and lists the new account", async () => {
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
    renderApp("/admin/providers");

    await user.click(await screen.findByRole("button", { name: en["providerLogin.open"] }));
    const dialog = screen.getByRole("dialog", { name: en["providerLogin.title"] });
    await user.selectOptions(within(dialog).getByLabelText(en["providerLogin.provider"]), "chatgpt");
    await user.click(within(dialog).getByRole("button", { name: en["providerLogin.getLink"] }));

    expect(
      await within(dialog).findByRole("textbox", { name: fill(en["providerLogin.link"], { provider: "chatgpt" }) }),
    ).toHaveTextContent(AUTH_URL);
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
    const dialog = screen.getByRole("dialog", { name: en["providerLogin.title"] });
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
          { window: "5h", usedRatio: 0.4, resetAt: "2026-09-23T12:00:00Z" },
          { window: "7d", usedRatio: 0.9, resetAt: null },
        ],
      }),
    ]);
    renderApp("/admin/providers");

    const fiveHours = await screen.findByRole("meter", { name: fill(en["providers.quotaLabel"], { window: "5h" }) });
    expect(fiveHours).toHaveAttribute("aria-valuenow", "40");
    expect(fiveHours.parentElement).toHaveTextContent(/40%.*resets/);
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
