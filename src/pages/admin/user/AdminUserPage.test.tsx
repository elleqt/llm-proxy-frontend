import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { authConfigQuery } from "../../../entities/session/authConfig";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { cached } from "../../../test/cache";
import { renderApp } from "../../../test/render";
import { fixtures, http, server, type Schemas } from "../../../test/server";

const ID = "00000000-0000-4000-8000-0000000000b1";
const SECRET = "sk-svc-0123456789abcdef-example";

interface Card {
  user?: Schemas["AdminUser"];
  tokens?: Schemas["Token"][];
  activity?: Schemas["Activity"];
  /** Whether sign-in through the identity provider is on. */
  oidc?: boolean;
  /** Coverage the preview answers with, per requested rule set. */
  preview?: (rules: string[]) => Schemas["PolicyPreview"];
  /** The account's spend limits as first shown. */
  limits?: Schemas["SpendLimits"];
}

/** An administrator on the card of `user`; the requests the card makes are recorded. */
function card({
  user = fixtures.adminUser(),
  tokens = [],
  activity = { requests: [], audit: [] },
  oidc = true,
  preview = () => ({ errors: [], covered: [] }),
  limits = fixtures.spendLimits(),
}: Card = {}) {
  const previews: string[][] = [];
  const limitPuts: Schemas["SpendLimitsUpdate"][] = [];
  const resets: Schemas["SpendLimitReset"][] = [];
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/users/{userId}", ({ response }) => response(200).json(user)),
    http.get("/api/admin/users/{userId}/tokens", ({ response }) => response(200).json(tokens)),
    http.get("/api/admin/users/{userId}/activity", ({ response }) => response(200).json(activity)),
    http.get("/api/auth/config", ({ response }) => response(200).json({ localLogin: true, oidc: { enabled: oidc } })),
    http.get("/api/admin/users", ({ response }) => response(200).json([user])),
    http.get("/api/admin/catalog", ({ response }) => response(200).json(fixtures.catalog())),
    http.post("/api/admin/policy/preview", async ({ request, response }) => {
      const { rules } = await request.json();
      previews.push(rules);
      return response(200).json(preview(rules));
    }),
    http.get("/api/admin/users/{userId}/limits", ({ response }) => response(200).json(limits)),
    // The saved set in force, each rule with no live window yet.
    http.put("/api/admin/users/{userId}/limits", async ({ request, response }) => {
      const body = await request.json();
      limitPuts.push(body);
      const custom = body.limits ?? [];
      return response(200).json(
        body.mode === "default"
          ? fixtures.spendLimits()
          : fixtures.spendLimits({ mode: "custom", custom, windows: custom.map((rule) => fixtures.spendWindow(rule)) }),
      );
    }),
    // The reset windows close: nothing live, nothing spent.
    http.post("/api/admin/users/{userId}/limits/reset", async ({ request, response }) => {
      const body = await request.json();
      resets.push(body);
      return response(200).json({
        ...limits,
        windows: limits.windows.map((window) =>
          body.windowMinutes === undefined || body.windowMinutes === window.windowMinutes
            ? { ...window, spentUsd: 0, startedAt: null, resetsAt: null, exhausted: false }
            : window,
        ),
      });
    }),
  );
  return { previews, limitPuts, resets };
}

describe("blocking", () => {
  it("shows the self-lockout refusal in the confirmation, and the account stays active", async () => {
    card();
    server.use(
      http.patch("/api/admin/users/{userId}", ({ response }) =>
        response(409).json({ code: "self_lockout", message: "cannot block yourself" }),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["admin.block"] }));
    const dialog = screen.getByRole("dialog", { name: fill(en["admin.blockTitle"], { name: "Grace Example" }) });
    expect(within(dialog).getByRole("button", { name: en["ui.cancel"] })).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: fill(en["admin.blockConfirm"], { name: "Grace Example" }) }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.self_lockout"]);
    expect(screen.getByRole("heading", { level: 1, name: "Grace Example" }).parentElement).toHaveTextContent(
      en["admin.status.active"],
    );
  });

  it("blocks after confirmation and shows the new status", async () => {
    card();
    let sent: Schemas["UpdateUserRequest"] | undefined;
    server.use(
      http.patch("/api/admin/users/{userId}", async ({ request, response }) => {
        sent = await request.json();
        return response(200).json(fixtures.adminUser({ status: "blocked" }));
      }),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["admin.block"] }));
    await user.click(screen.getByRole("button", { name: fill(en["admin.blockConfirm"], { name: "Grace Example" }) }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sent).toEqual({ status: "blocked" });
    expect(screen.getByRole("button", { name: en["admin.unblock"] })).toBeInTheDocument();
  });
});

describe("role", () => {
  it("changes the role once a different one is picked, and shows a self-lockout refusal in place", async () => {
    card({ user: fixtures.adminUser({ role: "admin" }) });
    const sent: Schemas["UpdateUserRequest"][] = [];
    server.use(
      http.patch("/api/admin/users/{userId}", async ({ request, response }) => {
        sent.push(await request.json());
        return response(409).json({ code: "self_lockout", message: "" });
      }),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    const change = await screen.findByRole("button", { name: en["admin.changeRole"] });
    expect(change).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(en["admin.role"]), "user");
    await user.click(change);

    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.self_lockout"]);
    expect(sent).toEqual([{ role: "user" }]);
  });
});

describe("keys and activity", () => {
  it("states a key that was never used, and lists recent requests and audit events", async () => {
    card({
      tokens: [fixtures.token({ label: "ci", lastUsedAt: null })],
      activity: {
        requests: [
          {
            at: "2026-09-23T08:00:00Z",
            tokenId: null,
            provider: "claude",
            model: "claude-sonnet-5",
            stream: true,
            statusCode: 429,
            tokensTotal: 1234,
            costUSD: 0.0012,
            latencyMs: 850,
          },
          {
            at: "2026-09-23T07:00:00Z",
            tokenId: null,
            provider: "chatgpt",
            model: "gpt-6",
            stream: false,
            statusCode: 200,
            tokensTotal: 500,
            costUSD: null,
            latencyMs: 300,
          },
        ],
        audit: [
          { at: "2026-09-22T08:00:00Z", action: "token.revoke", target: "old-laptop", actorId: null },
          { at: "2026-09-21T08:00:00Z", action: "user.policy.update", target: ID, actorId: null },
          {
            at: "2026-09-20T08:00:00Z",
            action: "user.create",
            target: "00000000-0000-4000-8000-00000000ffff",
            actorId: null,
          },
        ],
      },
    });
    renderApp(`/admin/users/${ID}`);

    const key = (await screen.findByRole("cell", { name: "ci" })).closest("tr") as HTMLElement;
    expect(key).toHaveTextContent(en["tokens.neverUsed"]);
    expect(within(key).getByRole("cell", { name: "sk-a1b2" })).toBeInTheDocument();
    const request = (await screen.findByRole("cell", { name: "claude:claude-sonnet-5" })).closest("tr") as HTMLElement;
    expect(request).toHaveTextContent("429");
    expect(request).toHaveTextContent("1,234");
    expect(request).toHaveTextContent(fill(en["admin.ms"], { ms: 850 }));
    // Cost: an estimate, or a dash when the request could not be priced.
    const costCell = (row: HTMLElement) => within(row).getAllByRole("cell")[4];
    expect(costCell(request)).toHaveTextContent(/^\$0\.0012$/);
    const unpriced = screen.getByRole("cell", { name: "chatgpt:gpt-6" }).closest("tr") as HTMLElement;
    expect(costCell(unpriced)).toHaveTextContent(/^—$/);
    const audit = screen.getByRole("cell", { name: "token.revoke" }).closest("tr") as HTMLElement;
    expect(audit).toHaveTextContent("old-laptop");
    // An account id reads as that account's name, linked to its card; an unknown one as a short id.
    const policyRow = screen.getByRole("cell", { name: "user.policy.update" }).closest("tr") as HTMLElement;
    expect(await within(policyRow).findByRole("link", { name: "Grace Example" })).toHaveAttribute(
      "href",
      `/admin/users/${ID}`,
    );
    const unknown = within(screen.getByRole("cell", { name: "user.create" }).closest("tr") as HTMLElement).getByRole(
      "link",
    );
    expect(unknown).toHaveTextContent("00000000…");
    expect(unknown).toHaveAttribute("title", "00000000-0000-4000-8000-00000000ffff");
  });
});

describe("invitation", () => {
  const invited = fixtures.adminUser({ signIn: [], invitationExpiresAt: "2026-09-20T09:00:00Z" });

  it("renews a lapsed invitation and shows the new expiry", async () => {
    let user = invited;
    let renewals = 0;
    card({ user });
    server.use(
      http.get("/api/admin/users/{userId}", ({ response }) => response(200).json(user)),
      http.get("/api/admin/users", ({ response }) => response(200).json([user])),
      http.post("/api/admin/users/{userId}/invitation", () => {
        renewals++;
        user = { ...user, invitationExpiresAt: "2099-01-01T09:00:00Z" };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const click = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    expect(await screen.findByText(en["admin.invitationLapsed"])).toBeInTheDocument();
    await click.click(screen.getByRole("button", { name: en["admin.renewInvitation"] }));

    expect(await screen.findByText(/2099/)).toHaveTextContent(fill(en["admin.invitationPending"], { time: "" }).trim());
    expect(screen.queryByText(en["admin.invitationLapsed"])).not.toBeInTheDocument();
    expect(renewals).toBe(1);
  });

  it("shows already_linked in place", async () => {
    card({ user: invited });
    server.use(
      http.post("/api/admin/users/{userId}/invitation", ({ response }) =>
        response(409).json({ code: "already_linked", message: "" }),
      ),
    );
    const click = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    await click.click(await screen.findByRole("button", { name: en["admin.renewInvitation"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.already_linked"]);
  });

  it.each([
    ["an unlinked password account", fixtures.adminUser({ signIn: ["password"], invitationExpiresAt: null })],
    ["an invitation used without a link", fixtures.adminUser({ signIn: [], invitationExpiresAt: null })],
  ])("offers an invitation to %s while identity-provider sign-in is on", async (_, account) => {
    card({ user: account });
    renderApp(`/admin/users/${ID}`);
    expect(await screen.findByRole("button", { name: en["admin.invite"] })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en["admin.renewInvitation"] })).not.toBeInTheDocument();
  });

  it.each([
    ["the identity provider is linked", { user: fixtures.adminUser({ signIn: ["oidc"], invitationExpiresAt: null }) }],
    ["identity-provider sign-in is off", { user: invited, oidc: false }],
  ])("is not offered when %s", async (_, options) => {
    card(options);
    const { queryClient } = renderApp(`/admin/users/${ID}`);
    await screen.findByRole("heading", { level: 1, name: "Grace Example" });
    // The card has what it decides by: the account and whether that sign-in is on.
    await waitFor(() => expect(queryClient.getQueryData(authConfigQuery.queryKey)).toBeDefined());
    expect(screen.queryByRole("button", { name: en["admin.renewInvitation"] })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en["admin.invite"] })).not.toBeInTheDocument();
  });
});

describe("password reset", () => {
  it("shows the temporary password once, after a confirmation, and keeps it in no cache", async () => {
    card();
    let resets = 0;
    server.use(
      http.post("/api/admin/users/{userId}/password-reset", ({ response }) => {
        resets++;
        return response(200).json({ password: "tmp-reset-example", expiresAt: "2026-09-26T09:00:00Z" });
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["admin.resetPassword"] }));
    expect(resets).toBe(0);
    const confirm = screen.getByRole("dialog", { name: fill(en["admin.resetTitle"], { name: "Grace Example" }) });
    await user.click(within(confirm).getByRole("button", { name: en["admin.resetConfirm"] }));

    const result = await screen.findByRole("dialog", {
      name: fill(en["admin.resetDoneTitle"], { name: "Grace Example" }),
    });
    expect(within(result).getByRole("textbox", { name: en["admin.tempPassword"] })).toHaveTextContent(
      "tmp-reset-example",
    );
    await waitFor(() => expect(cached(queryClient)).not.toContain("tmp-reset-example"));
    await user.click(within(result).getByRole("button", { name: en["issue.done"] }));
    expect(screen.queryByText("tmp-reset-example")).not.toBeInTheDocument();
    expect(cached(queryClient)).not.toContain("tmp-reset-example");
    expect(resets).toBe(1);
  });
});

describe("service account", () => {
  const service = fixtures.adminUser({ kind: "service", displayName: "nightly-report", email: null, signIn: [] });

  it("has no password reset, and gets a key issued on its behalf shown once and kept in no cache", async () => {
    const tokens: Schemas["Token"][] = [];
    card({ user: service, tokens });
    let sentLabel: string | undefined;
    server.use(
      http.post("/api/admin/users/{userId}/tokens", async ({ params, request, response }) => {
        expect(params.userId).toBe(ID);
        sentLabel = (await request.json()).label;
        const token = fixtures.token({ label: sentLabel, lastUsedAt: null });
        tokens.push(token);
        return response(201).json({ token, secret: SECRET });
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["admin.issueToken"] }));
    expect(screen.queryByRole("button", { name: en["admin.resetPassword"] })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(en["issue.label"]), "  exporter  ");
    await user.click(screen.getByRole("button", { name: en["issue.submit"] }));

    const result = await screen.findByRole("dialog", {
      name: fill(en["admin.issuedTitle"], { name: "nightly-report" }),
    });
    expect(within(result).getByRole("textbox")).toHaveTextContent(SECRET);
    expect(sentLabel).toBe("exporter");
    await waitFor(() => expect(cached(queryClient)).not.toContain(SECRET));
    await user.click(within(result).getByRole("button", { name: en["issue.done"] }));

    expect(await screen.findByRole("cell", { name: "exporter" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(cached(queryClient)).not.toContain(SECRET);
  });

  it("explains the key limit in the issue dialog", async () => {
    card({ user: service, tokens: [] });
    server.use(
      http.post("/api/admin/users/{userId}/tokens", ({ response }) =>
        response(409).json({ code: "token_limit", message: "" }),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["admin.issueToken"] }));
    await user.type(screen.getByLabelText(en["issue.label"]), "one too many");
    await user.click(screen.getByRole("button", { name: en["issue.submit"] }));

    const dialog = screen.getByRole("dialog", { name: fill(en["admin.issueTitle"], { name: "nightly-report" }) });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.token_limit"]);
  });

  it("revokes a key only once its label is typed", async () => {
    card({ user: service, tokens: [fixtures.token({ label: "exporter" })] });
    let revoked = 0;
    server.use(
      http.delete("/api/admin/users/{userId}/tokens/{tokenId}", () => {
        revoked++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: fill(en["revoke.openLabel"], { label: "exporter" }) }));
    const dialog = screen.getByRole("dialog", { name: fill(en["revoke.title"], { label: "exporter" }) });
    const confirm = within(dialog).getByRole("button", { name: en["revoke.confirm"] });
    const typed = within(dialog).getByLabelText(fill(en["admin.typeToConfirm"], { name: "exporter" }));

    expect(confirm).toBeDisabled();
    await user.type(typed, "exporte");
    expect(confirm).toBeDisabled();
    await user.type(typed, "r{Enter}");
    await waitFor(() => expect(revoked).toBe(1));
  });
});

describe("policy editor", () => {
  const coverage = (rules: string[]): Schemas["PolicyPreview"] => ({
    errors: rules
      .filter((rule) => !rule.includes(":") || rule.endsWith(":"))
      .map((rule) => ({ rule, code: "invalid_rule" })),
    covered: rules.includes("chatgpt:*")
      ? [{ provider: "chatgpt", model: "gpt-6" }]
      : [{ provider: "claude", model: "claude-sonnet-5" }],
  });

  it("previews what the rules cover as they are edited, with the wildcard note", async () => {
    const { previews } = card({ preview: coverage });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    const covered = await screen.findByRole("list", { name: en["policy.coveredModels"] });
    expect(covered).toHaveTextContent("claude:claude-sonnet-5");
    expect(screen.getByText(en["policy.wildcardNote"])).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en["policy.addRule"] }));
    await user.type(screen.getByLabelText(fill(en["policy.provider"], { n: 2 })), "chatgpt");
    await user.type(screen.getByLabelText(fill(en["policy.pattern"], { n: 2 })), "*");

    await waitFor(() =>
      expect(screen.getByRole("list", { name: en["policy.coveredModels"] })).toHaveTextContent("chatgpt:gpt-6"),
    );
    // Debounced: typing did not ask once per keystroke.
    expect(previews).toEqual([["claude:*"], ["claude:*", "chatgpt:*"]]);
  });

  it("shows a rule's error on that rule", async () => {
    card({ preview: coverage });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["policy.addRule"] }));
    await user.type(screen.getByLabelText(fill(en["policy.provider"], { n: 2 })), "chatgpt");

    await waitFor(() =>
      expect(screen.getByLabelText(fill(en["policy.pattern"], { n: 2 }))).toHaveAccessibleDescription(
        en["error.invalid_rule"],
      ),
    );
    expect(screen.getByLabelText(fill(en["policy.pattern"], { n: 1 }))).not.toHaveAccessibleDescription(
      en["error.invalid_rule"],
    );
  });

  it("saves the rules, and places the server's invalid_rule on the rule it names", async () => {
    card();
    const sent: string[][] = [];
    server.use(
      http.patch("/api/admin/users/{userId}", async ({ request, response }) => {
        const { policy = [] } = await request.json();
        sent.push(policy);
        return response(422).json({ code: "invalid_rule", message: "bad", field: "claude:[" });
      }),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    const pattern = await screen.findByLabelText(fill(en["policy.pattern"], { n: 1 }));
    await user.clear(pattern);
    await user.type(pattern, "[[");
    await user.click(screen.getByRole("button", { name: en["policy.save"] }));

    await waitFor(() => expect(pattern).toHaveAccessibleDescription(en["error.invalid_rule"]));
    expect(sent).toEqual([["claude:["]]);
  });

  it("is read-only when the identity provider owns the policy", async () => {
    card({ user: fixtures.adminUser({ policySource: "idp", signIn: ["oidc"] }), preview: coverage });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

    expect(await screen.findByRole("note")).toHaveTextContent(en["policy.idpReadOnly"]);
    const pattern = screen.getByLabelText(fill(en["policy.pattern"], { n: 1 }));
    await user.type(pattern, "x");
    expect(pattern).toHaveValue("*");
    expect(screen.queryByRole("button", { name: en["policy.save"] })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en["policy.addRule"] })).not.toBeInTheDocument();
    // What the policy covers is still shown.
    expect(await screen.findByRole("list", { name: en["policy.coveredModels"] })).toHaveTextContent(
      "claude:claude-sonnet-5",
    );
  });
});

describe("spend limits", () => {
  const LIVE = fixtures.spendWindow({
    spentUsd: 4,
    startedAt: "2026-09-28T10:00:00Z",
    resetsAt: "2026-09-28T12:00:00Z",
  });
  const IDLE = fixtures.spendWindow({ windowMinutes: 2880, amountUsd: 50 });
  const LIVE_PER = "$10.00 per 2 hours";
  const resetLive = fill(en["limits.resetLabel"], { window: LIVE_PER });

  /** Focus sits on the window list holding `inside`, not dropped to the page. */
  function expectFocusOnWindows(inside: HTMLElement) {
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(inside);
  }

  async function limitsCard() {
    return within(await screen.findByRole("region", { name: en["limits.title"] }));
  }

  it("shows inherited windows under Default, and saves an own limit", async () => {
    const { limitPuts } = card({ limits: fixtures.spendLimits({ windows: [IDLE] }) });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    expect(await limits.findByRole("radio", { name: en["limits.modeDefault"] })).toBeChecked();
    expect(limits.getByText("$50.00 per 2 days")).toBeInTheDocument();
    expect(limits.queryByRole("button", { name: en["limits.save"] })).not.toBeInTheDocument();

    await user.click(limits.getByRole("radio", { name: en["limits.modeCustom"] }));
    expect(limits.getByText(en["limits.none"])).toBeInTheDocument();
    await user.click(limits.getByRole("button", { name: en["limits.add"] }));
    await user.type(limits.getByRole("textbox", { name: en["limits.windowCount"] }), "2");
    await user.type(limits.getByRole("textbox", { name: en["limits.amount"] }), "10");
    await user.click(limits.getByRole("button", { name: en["limits.save"] }));

    await waitFor(() => expect(limitPuts).toEqual([{ mode: "custom", limits: [{ windowMinutes: 120, amountUsd: 10 }] }]));
    expect(await limits.findByText("$10.00 per 2 hours")).toBeInTheDocument();
    expect(limits.queryByText("$50.00 per 2 days")).not.toBeInTheDocument();
    expect(limits.getByRole("radio", { name: en["limits.modeCustom"] })).toBeChecked();
  });

  it("returns an account with its own limits to the defaults", async () => {
    const own = { windowMinutes: 60, amountUsd: 5 };
    const { limitPuts } = card({
      limits: fixtures.spendLimits({ mode: "custom", custom: [own], windows: [fixtures.spendWindow(own)] }),
    });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    expect(await limits.findByRole("radio", { name: en["limits.modeCustom"] })).toBeChecked();
    expect(limits.getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("1");
    await user.click(limits.getByRole("radio", { name: en["limits.modeDefault"] }));
    expect(limits.queryByRole("textbox", { name: en["limits.windowCount"] })).not.toBeInTheDocument();
    await user.click(limits.getByRole("button", { name: en["limits.save"] }));

    await waitFor(() => expect(limitPuts).toEqual([{ mode: "default" }]));
    // Saved: nothing is left to save while Default is the stored mode, and
    // focus moves from the gone button to the mode now stored.
    await waitFor(() => expect(limits.queryByRole("button", { name: en["limits.save"] })).not.toBeInTheDocument());
    expect(limits.getByRole("radio", { name: en["limits.modeDefault"] })).toBeChecked();
    expect(limits.getByRole("radio", { name: en["limits.modeDefault"] })).toHaveFocus();
  });

  it("shows a refused return to the defaults, and keeps the own limits", async () => {
    const own = { windowMinutes: 60, amountUsd: 5 };
    card({ limits: fixtures.spendLimits({ mode: "custom", custom: [own], windows: [fixtures.spendWindow(own)] }) });
    server.use(
      http.put("/api/admin/users/{userId}/limits", ({ response }) =>
        response(422).json({ code: "invalid_input", message: "", field: "mode" }),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    await user.click(await limits.findByRole("radio", { name: en["limits.modeDefault"] }));
    await user.click(limits.getByRole("button", { name: en["limits.save"] }));

    expect(await limits.findByRole("alert")).toHaveTextContent(en["error.invalid_input"]);
    expect(limits.getByRole("button", { name: en["limits.save"] })).toBeInTheDocument();
    await user.click(limits.getByRole("radio", { name: en["limits.modeCustom"] }));
    expect(limits.getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("1");
  });

  it("clears a refusal on a row once the rows are edited again", async () => {
    card({ limits: fixtures.spendLimits({ mode: "custom" }) });
    server.use(
      http.put("/api/admin/users/{userId}/limits", ({ response }) =>
        response(422).json({ code: "invalid_input", message: "", field: "[0].amountUsd" }),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    for (const [n, count, amount] of [
      [1, "1", "5"],
      [2, "2", "10"],
    ] as const) {
      await user.click(await limits.findByRole("button", { name: en["limits.add"] }));
      const row = within(limits.getByRole("group", { name: fill(en["limits.row"], { n }) }));
      await user.type(row.getByRole("textbox", { name: en["limits.windowCount"] }), count);
      await user.type(row.getByRole("textbox", { name: en["limits.amount"] }), amount);
    }
    await user.click(limits.getByRole("button", { name: en["limits.save"] }));
    const [first] = limits.getAllByRole("textbox", { name: en["limits.amount"] });
    await waitFor(() => expect(first).toHaveAccessibleDescription(en["error.invalid_input"]));

    // The refused row goes; the refusal must not move to the row now first.
    await user.click(limits.getAllByRole("button", { name: en["limits.remove"] })[0] as HTMLElement);

    expect(limits.getByRole("textbox", { name: en["limits.amount"] })).not.toHaveAccessibleDescription(
      en["error.invalid_input"],
    );
  });

  it("resets a live window after confirmation and shows it closed", async () => {
    const { resets } = card({ limits: fixtures.spendLimits({ windows: [LIVE, IDLE] }) });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    // Only the live window can be reset, and its button says which window.
    expect(await limits.findAllByRole("button", { name: new RegExp(`^${en["limits.resetLabel"].split("{window}")[0]}`) })).toHaveLength(1);
    await user.click(limits.getByRole("button", { name: resetLive }));
    const dialog = screen.getByRole("dialog", { name: fill(en["limits.resetTitle"], { window: LIVE_PER }) });
    expect(resets).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: en["limits.resetConfirm"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(resets).toEqual([{ windowMinutes: 120 }]);
    expect(limits.getAllByText(en["limits.opensWithRequest"])).toHaveLength(2);
    expect(limits.queryByRole("button", { name: resetLive })).not.toBeInTheDocument();
    expect(limits.queryByRole("button", { name: en["limits.resetAll"] })).not.toBeInTheDocument();
    // The reset button is gone; focus lands on the windows, not the page.
    expectFocusOnWindows(limits.getByText(LIVE_PER));
  });

  it("resets every window at once", async () => {
    const { resets } = card({ limits: fixtures.spendLimits({ windows: [LIVE, { ...LIVE, windowMinutes: 2880 }] }) });
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    await user.click(await limits.findByRole("button", { name: en["limits.resetAll"] }));
    const dialog = screen.getByRole("dialog", { name: en["limits.resetAllTitle"] });
    await user.click(within(dialog).getByRole("button", { name: en["limits.resetAllConfirm"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(resets).toEqual([{}]);
    expect(limits.getAllByText(en["limits.opensWithRequest"])).toHaveLength(2);
    expectFocusOnWindows(limits.getByText(LIVE_PER));
  });

  it("shows a refused reset inside the confirmation, and the window stays live", async () => {
    card({ limits: fixtures.spendLimits({ windows: [LIVE] }) });
    server.use(
      http.post("/api/admin/users/{userId}/limits/reset", ({ response }) =>
        response(422).json({ code: "invalid_input", message: "", field: "windowMinutes" }),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);
    const limits = await limitsCard();

    await user.click(await limits.findByRole("button", { name: resetLive }));
    const dialog = screen.getByRole("dialog", { name: fill(en["limits.resetTitle"], { window: LIVE_PER }) });
    await user.click(within(dialog).getByRole("button", { name: en["limits.resetConfirm"] }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(en["error.invalid_input"]);
    expect(limits.getByText("$4.00 of $10.00")).toBeInTheDocument();
  });
});
