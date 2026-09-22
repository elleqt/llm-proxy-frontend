import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { renderApp } from "../../../test/render";
import { fixtures, http, server, type Schemas } from "../../../test/server";

const ID = "00000000-0000-4000-8000-0000000000b1";
const SECRET = "sk-svc-0123456789abcdef-example";

interface Card {
  user?: Schemas["AdminUser"];
  tokens?: Schemas["Token"][];
  /** Coverage the preview answers with, per requested rule set. */
  preview?: (rules: string[]) => Schemas["PolicyPreview"];
}

/** An administrator on the card of `user`; the requests the card makes are recorded. */
function card({ user = fixtures.adminUser(), tokens = [], preview = () => ({ errors: [], covered: [] }) }: Card = {}) {
  const previews: string[][] = [];
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/users/{userId}", ({ response }) => response(200).json(user)),
    http.get("/api/admin/users/{userId}/tokens", ({ response }) => response(200).json(tokens)),
    http.get("/api/admin/users/{userId}/activity", ({ response }) => response(200).json({ requests: [], audit: [] })),
    http.get("/api/admin/catalog", ({ response }) => response(200).json(fixtures.catalog())),
    http.post("/api/admin/policy/preview", async ({ request, response }) => {
      const { rules } = await request.json();
      previews.push(rules);
      return response(200).json(preview(rules));
    }),
  );
  return { previews };
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

describe("password reset", () => {
  it("shows the temporary password once, after a confirmation", async () => {
    card();
    let resets = 0;
    server.use(
      http.post("/api/admin/users/{userId}/password-reset", ({ response }) => {
        resets++;
        return response(200).json({ password: "tmp-reset-example", expiresAt: "2026-09-26T09:00:00Z" });
      }),
    );
    const user = userEvent.setup();
    renderApp(`/admin/users/${ID}`);

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
    await user.click(within(result).getByRole("button", { name: en["issue.done"] }));
    expect(screen.queryByText("tmp-reset-example")).not.toBeInTheDocument();
    expect(resets).toBe(1);
  });
});

describe("service account", () => {
  const service = fixtures.adminUser({ kind: "service", displayName: "nightly-report", email: null, signIn: [] });

  it("has no password reset, and gets a key issued on its behalf shown once", async () => {
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
    renderApp(`/admin/users/${ID}`);

    await user.click(await screen.findByRole("button", { name: en["admin.issueToken"] }));
    expect(screen.queryByRole("button", { name: en["admin.resetPassword"] })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(en["issue.label"]), "  exporter  ");
    await user.click(screen.getByRole("button", { name: en["issue.submit"] }));

    const result = await screen.findByRole("dialog", {
      name: fill(en["admin.issuedTitle"], { name: "nightly-report" }),
    });
    expect(within(result).getByRole("textbox")).toHaveTextContent(SECRET);
    expect(sentLabel).toBe("exporter");
    await user.click(within(result).getByRole("button", { name: en["issue.done"] }));

    expect(await screen.findByRole("cell", { name: "exporter" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
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
