import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { renderApp } from "../../../test/render";
import { fixtures, http, server, type Schemas } from "../../../test/server";

const SETTINGS: Schemas["Settings"] = {
  yaml: "request-retry: 3\nmax-retry-interval: 30\n",
  fields: { proxyURL: "", requestRetry: 3, maxRetryInterval: 30 },
};
const DIFF = "-request-retry: 3\n+request-retry: 5\n";

function settingsScreen(prices: Schemas["ModelPrice"][] = []) {
  const updates: Schemas["SettingsUpdateRequest"][] = [];
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/settings", ({ response }) => response(200).json(SETTINGS)),
    http.get("/api/admin/prices", ({ response }) => response(200).json(prices)),
    http.put("/api/admin/settings", async ({ request, response }) => {
      const body = await request.json();
      updates.push(body);
      const settings = body.dryRun ? SETTINGS : { ...SETTINGS, fields: { ...SETTINGS.fields, ...body.fields } };
      return response(200).json({ applied: !body.dryRun, diff: DIFF, settings });
    }),
  );
  return { updates };
}

describe("gateway settings", () => {
  it("checks as a dry run showing the diff, then applies only after a separate confirmation", async () => {
    const { updates } = settingsScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    const retries = await screen.findByLabelText(en["settings.requestRetry"]);
    const apply = screen.getByRole("button", { name: en["settings.apply"] });
    expect(apply).toBeDisabled();
    await user.clear(retries);
    await user.type(retries, "5");
    await user.click(screen.getByRole("button", { name: en["settings.check"] }));

    expect(await screen.findByRole("region", { name: en["settings.diff"] })).toHaveTextContent("+request-retry: 5");
    expect(updates).toEqual([{ fields: { proxyURL: "", requestRetry: 5, maxRetryInterval: 30 }, dryRun: true }]);

    // An edit after the check is unchecked: it cannot be applied.
    await user.type(retries, "0");
    expect(apply).toBeDisabled();
    await user.clear(retries);
    await user.type(retries, "5");
    await user.click(screen.getByRole("button", { name: en["settings.check"] }));
    await waitFor(() => expect(apply).toBeEnabled());

    await user.click(apply);
    const dialog = screen.getByRole("dialog", { name: en["settings.applyTitle"] });
    expect(dialog).toHaveTextContent("+request-retry: 5");
    expect(updates).toHaveLength(2);
    await user.click(within(dialog).getByRole("button", { name: en["settings.applyConfirm"] }));

    expect(await screen.findByText(en["settings.applied"])).toBeInTheDocument();
    expect(updates[2]).toEqual({ fields: { proxyURL: "", requestRetry: 5, maxRetryInterval: 30 }, dryRun: false });
  });

  it("names the field a forbidden_setting refusal is about", async () => {
    settingsScreen();
    server.use(
      http.put("/api/admin/settings", ({ response }) =>
        response(422).json({ code: "forbidden_setting", message: "", field: "port" }),
      ),
    );
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(await screen.findByRole("tab", { name: en["settings.yaml"] }));
    await user.type(screen.getByLabelText(en["settings.yamlLabel"]), "port: 1");
    await user.click(screen.getByRole("button", { name: en["settings.check"] }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      fill(en["settings.errorField"], { error: en["error.forbidden_setting"], field: "port" }),
    );
    expect(screen.getByRole("button", { name: en["settings.apply"] })).toBeDisabled();
  });
});

describe("price list", () => {
  it("edits, adds and removes rows, and saves the whole list", async () => {
    settingsScreen([
      { provider: "claude", model: "claude-sonnet-5", input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      { provider: "chatgpt", model: "gpt-6", input: 2, output: 8, cacheRead: 0.2, cacheWrite: 0 },
    ]);
    let sent: Schemas["ModelPrice"][] | undefined;
    server.use(
      http.put("/api/admin/prices", async ({ request, response }) => {
        sent = await request.json();
        return response(200).json(sent);
      }),
    );
    const user = userEvent.setup();
    renderApp("/admin/settings");

    const output = await screen.findByLabelText(fill(en["prices.outputLabel"], { row: "claude:claude-sonnet-5" }));
    await user.clear(output);
    await user.type(output, "12.5");
    await user.click(screen.getByRole("button", { name: fill(en["prices.removeLabel"], { row: "chatgpt:gpt-6" }) }));
    await user.click(screen.getByRole("button", { name: en["prices.add"] }));
    await user.type(screen.getByLabelText(fill(en["prices.providerLabel"], { row: ":" })), "gemini");
    await user.type(screen.getByLabelText(fill(en["prices.modelLabel"], { row: "gemini:" })), "gemini-3-pro");

    // A row with a price that is not a number is refused before sending.
    const input = screen.getByLabelText(fill(en["prices.inputLabel"], { row: "gemini:gemini-3-pro" }));
    await user.clear(input);
    await user.type(input, "-1");
    await user.click(screen.getByRole("button", { name: en["prices.save"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en["prices.invalid"]);
    expect(sent).toBeUndefined();

    await user.clear(input);
    await user.type(input, "1.25");
    await user.click(screen.getByRole("button", { name: en["prices.save"] }));

    await screen.findByText(en["prices.saved"]);
    expect(sent).toEqual([
      { provider: "claude", model: "claude-sonnet-5", input: 3, output: 12.5, cacheRead: 0.3, cacheWrite: 3.75 },
      { provider: "gemini", model: "gemini-3-pro", input: 1.25, output: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
  });
});
