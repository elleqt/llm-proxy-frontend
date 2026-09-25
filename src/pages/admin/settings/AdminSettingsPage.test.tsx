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

function settingsScreen() {
  const updates: Schemas["SettingsUpdateRequest"][] = [];
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/settings", ({ response }) => response(200).json(SETTINGS)),
    http.get("/api/admin/prices", ({ response }) =>
      response(200).json({
        prices: [],
        catalog: { enabled: false, checkedAt: null, changedAt: null, models: 0, lastError: null },
      }),
    ),
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

  it("copies the YAML as edited", async () => {
    settingsScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(await screen.findByRole("tab", { name: en["settings.yaml"] }));
    await user.type(screen.getByLabelText(en["settings.yamlLabel"]), "port: 1");
    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    await expect(navigator.clipboard.readText()).resolves.toBe(`${SETTINGS.yaml}port: 1`);
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
