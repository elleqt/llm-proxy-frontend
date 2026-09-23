import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { en } from "../../../shared/i18n/en";
import { ru } from "../../../shared/i18n/ru";
import { fill } from "../../../shared/lib/template";
import { renderApp } from "../../../test/render";
import { errorResponse, fixtures, http, server, type Schemas } from "../../../test/server";

const CATALOG: Schemas["PriceCatalog"] = {
  enabled: true,
  checkedAt: "2026-09-23T08:00:00Z",
  changedAt: "2026-09-20T08:00:00Z",
  models: 2,
  lastError: null,
};

/** Catalog rows for gpt-6 and claude-sonnet-5; the latter overridden by hand; plus a manual-only row. */
const LIST: Schemas["PriceList"] = {
  catalog: CATALOG,
  prices: [
    {
      provider: "chatgpt",
      model: "gpt-6",
      input: 2.5,
      output: 10,
      cacheRead: 0.25,
      cacheWrite: 0,
      source: "catalog",
      updatedAt: "2026-09-20T08:00:00Z",
    },
    {
      provider: "claude",
      model: "claude-sonnet-5",
      input: 2,
      output: 12,
      cacheRead: 0.2,
      cacheWrite: 3,
      source: "manual",
      updatedAt: "2026-09-21T08:00:00Z",
      catalogRates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    },
    {
      provider: "local",
      model: "llama-4-70b",
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      source: "manual",
      updatedAt: "2026-09-10T08:00:00Z",
    },
  ],
};
const SONNET = { provider: "claude", model: "claude-sonnet-5", input: 2, output: 12, cacheRead: 0.2, cacheWrite: 3 };
const LLAMA = { provider: "local", model: "llama-4-70b", input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** An administrator on /admin/settings; every PUT of the override list is recorded and answered with `LIST`. */
function pricesScreen(list: Schemas["PriceList"] = LIST) {
  const puts: Schemas["ModelPrice"][][] = [];
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/settings", ({ response }) =>
      response(200).json({ yaml: "", fields: { proxyURL: "", requestRetry: 3, maxRetryInterval: 30 } }),
    ),
    http.get("/api/admin/prices", ({ response }) => response(200).json(list)),
    http.put("/api/admin/prices", async ({ request, response }) => {
      puts.push(await request.json());
      return response(200).json(list);
    }),
  );
  return { puts };
}

const row = async (name: string) => (await screen.findByRole("cell", { name })).closest("tr") as HTMLElement;

describe("price list", () => {
  it("shows which rows are manual overrides, with the catalog's rates beside theirs", async () => {
    pricesScreen();
    renderApp("/admin/settings");

    const sonnet = await row("claude:claude-sonnet-5");
    expect(sonnet).toHaveTextContent(en["prices.source.manual"]);
    expect(
      within(sonnet).getByRole("cell", {
        name: `${en["prices.output"]}12${fill(en["prices.catalogValue"], { value: 15 })}`,
      }),
    ).toBeInTheDocument();
    expect(
      within(sonnet).getByRole("button", { name: fill(en["prices.resetLabel"], { row: "claude:claude-sonnet-5" }) }),
    ).toBeInTheDocument();

    const gpt = await row("chatgpt:gpt-6");
    expect(gpt).toHaveTextContent(en["prices.source.catalog"]);
    expect(gpt).not.toHaveTextContent(fill(en["prices.catalogValue"], { value: "" }).trim());
    expect(within(gpt).queryByRole("button", { name: /Reset|Delete/ })).not.toBeInTheDocument();

    const llama = await row("local:llama-4-70b");
    expect(
      within(llama).getByRole("button", { name: fill(en["prices.deleteLabel"], { row: "local:llama-4-70b" }) }),
    ).toBeInTheDocument();
  });

  it("filters by provider or model", async () => {
    pricesScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");
    await row("chatgpt:gpt-6");

    await user.type(screen.getByRole("searchbox", { name: en["prices.filter"] }), "CLAUDE");
    expect(screen.getByRole("cell", { name: "claude:claude-sonnet-5" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "chatgpt:gpt-6" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: en["prices.filter"] }));
    await user.type(screen.getByRole("searchbox", { name: en["prices.filter"] }), "nothing-like-this");
    expect(screen.getByText(en["prices.noMatches"])).toBeInTheDocument();
  });

  it("resets an override to the catalog by sending the override list without it", async () => {
    const { puts } = pricesScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(
      within(await row("claude:claude-sonnet-5")).getByRole("button", {
        name: fill(en["prices.resetLabel"], { row: "claude:claude-sonnet-5" }),
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: fill(en["prices.resetTitle"], { row: "claude:claude-sonnet-5" }),
    });
    expect(dialog).toHaveTextContent("15");
    await user.click(within(dialog).getByRole("button", { name: en["prices.resetConfirm"] }));

    await waitFor(() => expect(puts).toEqual([[LLAMA]]));
  });

  it("deletes a manual price the catalog lacks", async () => {
    const { puts } = pricesScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(
      within(await row("local:llama-4-70b")).getByRole("button", {
        name: fill(en["prices.deleteLabel"], { row: "local:llama-4-70b" }),
      }),
    );
    await user.click(screen.getByRole("button", { name: en["prices.deleteConfirm"] }));
    await waitFor(() => expect(puts).toEqual([[SONNET]]));
  });

  it("saves an edited catalog row as an override, with every other override kept", async () => {
    const { puts } = pricesScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(
      within(await row("chatgpt:gpt-6")).getByRole("button", {
        name: fill(en["prices.editLabel"], { row: "chatgpt:gpt-6" }),
      }),
    );
    const dialog = screen.getByRole("dialog", { name: fill(en["prices.editTitle"], { row: "chatgpt:gpt-6" }) });
    const output = within(dialog).getByLabelText(en["prices.output"]);
    await user.clear(output);
    await user.type(output, "8.5");
    await user.click(within(dialog).getByRole("button", { name: en["prices.save"] }));

    await waitFor(() =>
      expect(puts).toEqual([
        [
          SONNET,
          LLAMA,
          { provider: "chatgpt", model: "gpt-6", input: 2.5, output: 8.5, cacheRead: 0.25, cacheWrite: 0 },
        ],
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("places a refusal naming the edited rate on that field", async () => {
    pricesScreen();
    server.use(
      http.put("/api/admin/prices", ({ response }) =>
        response(422).json({ code: "invalid_input", message: "", field: "[2].input" }),
      ),
    );
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(
      within(await row("chatgpt:gpt-6")).getByRole("button", {
        name: fill(en["prices.editLabel"], { row: "chatgpt:gpt-6" }),
      }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: en["prices.save"] }));

    await waitFor(() =>
      expect(within(dialog).getByLabelText(en["prices.input"])).toHaveAccessibleDescription(en["error.invalid_input"]),
    );
  });

  it("adds a price for a model the catalog lacks, in Russian with a decimal comma, refusing other number forms", async () => {
    document.documentElement.setAttribute("data-lang", "ru");
    const { puts } = pricesScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(await screen.findByRole("button", { name: ru["prices.add"] }));
    const dialog = screen.getByRole("dialog", { name: ru["prices.addTitle"] });
    await user.type(within(dialog).getByLabelText(ru["prices.provider"]), "local");
    await user.type(within(dialog).getByLabelText(ru["prices.model"]), "qwen3-32b");
    for (const [rate, value] of [
      ["input", "0x10"],
      ["output", "1,5"],
      ["cacheRead", "0"],
      ["cacheWrite", "0"],
    ] as const) {
      await user.type(within(dialog).getByLabelText(ru[`prices.${rate}`]), value);
    }
    await user.click(within(dialog).getByRole("button", { name: ru["prices.save"] }));
    expect(within(dialog).getByLabelText(ru["prices.input"])).toHaveAccessibleDescription(ru["prices.rateInvalid"]);
    expect(puts).toEqual([]);

    await user.clear(within(dialog).getByLabelText(ru["prices.input"]));
    await user.type(within(dialog).getByLabelText(ru["prices.input"]), "0,25");
    await user.click(within(dialog).getByRole("button", { name: ru["prices.save"] }));
    await waitFor(() =>
      expect(puts).toEqual([
        [
          SONNET,
          LLAMA,
          { provider: "local", model: "qwen3-32b", input: 0.25, output: 1.5, cacheRead: 0, cacheWrite: 0 },
        ],
      ]),
    );
  });
});

describe("price catalog", () => {
  it("shows when it was checked, and the last failure as a warning", async () => {
    pricesScreen({ ...LIST, catalog: { ...CATALOG, lastError: "GET https://catalog.example.com/x.json: 503" } });
    renderApp("/admin/settings");

    expect(await screen.findByText(/^Catalog: checked .*, 2 models\./)).toBeInTheDocument();
    expect(
      screen.getByText(fill(en["prices.catalogError"], { error: "GET https://catalog.example.com/x.json: 503" })),
    ).toBeInTheDocument();
  });

  it("refreshes on demand and shows the new state", async () => {
    pricesScreen({ ...LIST, catalog: { ...CATALOG, lastError: "timeout" } });
    let refreshes = 0;
    server.use(
      http.post("/api/admin/prices/refresh", ({ response }) => {
        refreshes++;
        return response(200).json({ ...LIST, catalog: { ...CATALOG, models: 41, lastError: null } });
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(await screen.findByRole("button", { name: en["prices.refresh"] }));
    expect(await screen.findByText(/41 models/)).toBeInTheDocument();
    expect(screen.queryByText(fill(en["prices.catalogError"], { error: "timeout" }))).not.toBeInTheDocument();
    expect(refreshes).toBe(1);
  });

  it("shows catalog_disabled from a refresh in place", async () => {
    pricesScreen();
    server.use(
      http.post("/api/admin/prices/refresh", ({ response }) =>
        response.untyped(errorResponse(409, { code: "catalog_disabled", message: "" })),
      ),
    );
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(await screen.findByRole("button", { name: en["prices.refresh"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.catalog_disabled"]);
  });

  it("says automatic updates are off, with nothing to refresh", async () => {
    pricesScreen({ ...LIST, catalog: { ...CATALOG, enabled: false, checkedAt: null, changedAt: null } });
    renderApp("/admin/settings");

    expect(await screen.findByText(en["prices.catalogOff"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en["prices.refresh"] })).toBeDisabled();
  });
});
