import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import type uPlot from "uplot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderApp } from "../../test/render";
import { fixtures, http, server, type Schemas } from "../../test/server";

// jsdom has no canvas: a stand-in uPlot records what the chart is asked to draw.
const plots = vi.hoisted(() => [] as { opts: uPlot.Options; data: uPlot.AlignedData }[]);
vi.mock("uplot", () => ({
  default: class {
    constructor(opts: uPlot.Options, data: uPlot.AlignedData) {
      plots.push({ opts, data });
    }
    setData() {}
    setSize() {}
    destroy() {}
  },
}));

beforeEach(() => {
  plots.length = 0;
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SECRET = "sk-a1b2-0123456789abcdef0123456789abcdef";

/** A signed-in user with `tokens`; the list is live, so issuing and revoking change it. */
function cabinet(tokens: Schemas["Token"][], usage: Schemas["Usage"] = fixtures.usage()) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me())),
    http.get("/api/me/tokens", ({ response }) => response(200).json(tokens)),
    http.get("/api/me/usage", ({ response }) => response(200).json(usage)),
    http.get("/api/connect", ({ response }) => response(200).json({ apiBaseURL: "https://proxy.example.com" })),
  );
}

function row(label: string) {
  return screen.getByRole("cell", { name: label }).closest("tr") as HTMLElement;
}

describe("key table", () => {
  it("states a key that was never used, rather than leaving the cell blank", async () => {
    cabinet([
      fixtures.token({ label: "laptop" }),
      fixtures.token({ id: "00000000-0000-4000-8000-0000000000a2", label: "ci", lastUsedAt: null }),
      fixtures.token({ id: "00000000-0000-4000-8000-0000000000a3", label: "old", revokedAt: "2026-09-10T00:00:00Z" }),
    ]);
    renderApp("/");

    await screen.findByText("laptop");
    expect(row("ci")).toHaveTextContent(en["tokens.neverUsed"]);
    expect(row("laptop")).not.toHaveTextContent(en["tokens.neverUsed"]);
    expect(row("old")).toHaveTextContent(en["tokens.revoked"]);
    expect(within(row("old")).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("issuing a key", () => {
  it("shows the secret once, then only /connect of this tab has it", async () => {
    const tokens: Schemas["Token"][] = [];
    cabinet(tokens);
    let sent: unknown;
    server.use(
      http.post("/api/me/tokens", async ({ request, response }) => {
        sent = await request.json();
        const token = fixtures.token({ label: "workstation", lastUsedAt: null });
        tokens.unshift(token);
        return response(201).json({ token, secret: SECRET });
      }),
    );
    const { router } = renderApp("/");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: en["issue.open"] }));
    await user.type(screen.getByLabelText(en["issue.label"]), "  workstation ");
    await user.click(screen.getByRole("button", { name: en["issue.submit"] }));

    const dialog = await screen.findByRole("dialog", { name: en["issue.issuedTitle"] });
    expect(within(dialog).getByRole("group", { name: "Key “workstation”" })).toHaveTextContent(SECRET);
    expect(within(dialog).getByRole("link", { name: en["issue.connect"] })).toHaveAttribute("href", "/connect");
    expect(sent).toEqual({ label: "workstation" });

    // A stray click beside the dialog does not throw the secret away.
    await user.pointer({ keys: "[MouseLeft]", target: dialog.parentElement as HTMLElement });
    expect(screen.getByRole("dialog", { name: en["issue.issuedTitle"] })).toHaveTextContent(SECRET);

    await user.click(within(dialog).getByRole("button", { name: en["issue.done"] }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "workstation" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(SECRET);

    // Reopening starts a new issue, not the old secret.
    await user.click(screen.getByRole("button", { name: en["issue.open"] }));
    expect(screen.getByRole("dialog", { name: en["issue.open"] })).not.toHaveTextContent(SECRET);
    await user.click(screen.getByRole("button", { name: en["ui.cancel"] }));

    // Away and back: the cabinet re-renders from scratch without it.
    await router.navigate("/connect");
    expect(await screen.findByText(/ANTHROPIC_AUTH_TOKEN="sk-a1b2-0123/)).toHaveTextContent(SECRET);
    await router.navigate("/");
    await screen.findByRole("cell", { name: "workstation" });
    expect(document.body).not.toHaveTextContent(SECRET);
  });

  it("asks for a label instead of sending an empty one", async () => {
    cabinet([]);
    renderApp("/");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: en["issue.open"] }));
    await user.type(screen.getByLabelText(en["issue.label"]), "   ");
    await user.click(screen.getByRole("button", { name: en["issue.submit"] }));

    expect(screen.getByLabelText(en["issue.label"])).toHaveAccessibleDescription(
      `${en["issue.labelHint"]} ${en["issue.labelRequired"]}`,
    );
  });
});

describe("revoking a key", () => {
  it("names the key in the confirmation and revokes only on confirm", async () => {
    const laptop = fixtures.token({ label: "laptop" });
    const ci = fixtures.token({ id: "00000000-0000-4000-8000-0000000000a2", label: "ci" });
    const tokens = [laptop, ci];
    cabinet(tokens);
    const revoked: string[] = [];
    server.use(
      http.delete("/api/me/tokens/{tokenId}", ({ params }) => {
        revoked.push(params.tokenId);
        const token = tokens.find((candidate) => candidate.id === params.tokenId);
        if (token) token.revokedAt = "2026-09-23T10:00:00Z";
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp("/");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Revoke key “ci”" }));
    let dialog = screen.getByRole("dialog", { name: "Revoke key “ci”?" });
    expect(dialog).toHaveTextContent("Clients using “ci” stop working");
    // A destructive confirmation opens on the safe choice.
    expect(within(dialog).getByRole("button", { name: en["ui.cancel"] })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: en["ui.cancel"] }));
    expect(revoked).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Revoke key “ci”" }));
    dialog = screen.getByRole("dialog", { name: "Revoke key “ci”?" });
    await user.click(within(dialog).getByRole("button", { name: en["revoke.confirm"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(revoked).toEqual([ci.id]);
    expect(row("ci")).toHaveTextContent(en["tokens.revoked"]);
    expect(row("laptop")).toHaveTextContent(en["tokens.active"]);
    // The row's button is gone; focus lands on the list, not on <body>.
    expect(document.activeElement).toContainElement(screen.getByRole("table", { name: en["page.cabinet.title"] }));
  });
});

describe("usage", () => {
  it("shows totals and a line per model, and asks for the chosen period", async () => {
    const usage = fixtures.usage({
      from: "2026-09-23T07:00:00Z",
      to: "2026-09-23T10:00:00Z",
      totals: { requests: 5, tokensTotal: 1234 },
      points: [
        { at: "2026-09-23T07:00:00Z", model: "claude-sonnet-5", requests: 1, tokensTotal: 100 },
        { at: "2026-09-23T09:00:00Z", model: "claude-sonnet-5", requests: 2, tokensTotal: 900 },
        { at: "2026-09-23T08:00:00Z", model: "gpt-6", requests: 2, tokensTotal: 234 },
      ],
    });
    cabinet([], usage);
    const periods: number[] = [];
    server.use(
      http.get("/api/me/usage", ({ query, response }) => {
        const from = query.get("from");
        const to = query.get("to");
        if (from !== null && to !== null) periods.push((Date.parse(to) - Date.parse(from)) / 3_600_000);
        return response(200).json(usage);
      }),
    );
    renderApp("/");

    const totals = await screen.findByText("1,234");
    expect(totals.closest("div")).toHaveTextContent(en["usage.tokens"]);
    expect(screen.getByRole("img", { name: en["usage.chart"] })).toBeInTheDocument();
    await waitFor(() => expect(plots).toHaveLength(1));
    const plot = plots[0]!;
    expect(plot.opts.series.slice(1).map((s) => s.label)).toEqual(["claude-sonnet-5", "gpt-6"]);
    // Every hour of the period, an hour without requests being zero.
    const hour = (h: number) => Date.parse(`2026-09-23T0${h}:00:00Z`) / 1000;
    expect(plot.data).toEqual([
      [hour(7), hour(8), hour(9)],
      [100, 0, 900],
      [0, 234, 0],
    ]);

    await userEvent.click(screen.getByRole("button", { name: en["usage.period.7d"] }));
    await waitFor(() => expect(periods).toEqual([24, 168]));
    expect(screen.getByRole("button", { name: en["usage.period.7d"] })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: en["usage.period.24h"] })).toHaveAttribute("aria-pressed", "false");
  });
});
