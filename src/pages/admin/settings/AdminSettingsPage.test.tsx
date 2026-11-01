import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { configQuery } from "../../../entities/config/config";
import { settingsQuery } from "../../../entities/settings/settings";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { renderApp } from "../../../test/render";
import { errorResponse, fixtures, http, server, type Schemas } from "../../../test/server";

const SETTINGS: Schemas["Settings"] = {
  yaml: "request-retry: 3\nmax-retry-interval: 30\n",
  fields: { proxyURL: "", requestRetry: 3, maxRetryInterval: 30, sessionAffinity: true },
};
const DIFF = "-request-retry: 3\n+request-retry: 5\n";

/** An administrator on /admin/settings; every settings PUT and default-limits PUT is recorded. */
function settingsScreen(
  limits: Schemas["SpendLimit"][] = [],
  saveLimits: (sent: Schemas["SpendLimit"][]) => Schemas["SpendLimit"][] = (sent) => sent,
) {
  const updates: Schemas["SettingsUpdateRequest"][] = [];
  const limitPuts: Schemas["SpendLimit"][][] = [];
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/settings", ({ response }) => response(200).json(SETTINGS)),
    http.get("/api/admin/prices", ({ response }) =>
      response(200).json({
        prices: [],
        catalog: { enabled: false, checkedAt: null, changedAt: null, models: 0, lastError: null },
      }),
    ),
    http.get("/api/admin/limits", ({ response }) => response(200).json(limits)),
    http.put("/api/admin/limits", async ({ request, response }) => {
      const body = await request.json();
      limitPuts.push(body);
      return response(200).json(saveLimits(body));
    }),
    http.put("/api/admin/settings", async ({ request, response }) => {
      const body = await request.json();
      updates.push(body);
      const settings = body.dryRun ? SETTINGS : { ...SETTINGS, fields: { ...SETTINGS.fields, ...body.fields } };
      return response(200).json({ applied: !body.dryRun, diff: DIFF, settings });
    }),
  );
  return { updates, limitPuts };
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
    expect(updates).toEqual([
      { fields: { proxyURL: "", requestRetry: 5, maxRetryInterval: 30 }, dryRun: true },
    ]);

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
    expect(updates[2]).toEqual({
      fields: { proxyURL: "", requestRetry: 5, maxRetryInterval: 30 },
      dryRun: false,
    });
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

  it("links the CLIProxyAPI configuration reference from the YAML tab", async () => {
    settingsScreen();
    const user = userEvent.setup();
    renderApp("/admin/settings");

    await user.click(await screen.findByRole("tab", { name: en["settings.yaml"] }));

    expect(screen.getByRole("link", { name: en["settings.yamlDocs"] })).toHaveAttribute(
      "href",
      "https://help.router-for.me/configuration/basic",
    );
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

describe("costs shown to users", () => {
  it("reads the setting, saves the switched value and shows what the server kept", async () => {
    settingsScreen();
    let stored: Schemas["AdminConfig"] = { costsVisible: false, maskUnknownErrors: false };
    const puts: Schemas["AdminConfigUpdate"][] = [];
    server.use(
      http.get("/api/admin/config", ({ response }) => response(200).json(stored)),
      http.put("/api/admin/config", async ({ request, response }) => {
        const patch = await request.json();
        stored = { ...stored, ...patch };
        puts.push(patch);
        return response(200).json(stored);
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderApp("/admin/settings");
    // A config the interface already holds must be fetched again after the change.
    queryClient.setQueryData(configQuery.queryKey, fixtures.config());

    const toggle = await screen.findByRole("switch", { name: en["settings.costsVisible"] });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(puts).toEqual([{ costsVisible: true }]);
    expect(screen.getByRole("switch", { name: en["settings.maskUnknownErrors"] })).not.toBeChecked();
    expect(queryClient.getQueryState(configQuery.queryKey)?.isInvalidated).toBe(true);
  });
});

describe("default spend limits", () => {
  const region = () => screen.findByRole("region", { name: en["limits.defaultsTitle"] });
  const row = (card: HTMLElement, n: number) =>
    within(within(card).getByRole("group", { name: fill(en["limits.row"], { n }) }));

  it("sits above the price list", async () => {
    settingsScreen([{ windowMinutes: 120, amountUsd: 10 }]);
    renderApp("/admin/settings");

    const defaults = await region();
    const prices = await screen.findByRole("region", { name: en["prices.title"] });
    expect(defaults.compareDocumentPosition(prices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists the defaults, saves the edited list and shows the list the server kept", async () => {
    // The server keeps the set shortest window first.
    const { limitPuts } = settingsScreen([{ windowMinutes: 120, amountUsd: 10 }], (sent) =>
      [...sent].sort((a, b) => a.windowMinutes - b.windowMinutes),
    );
    const user = userEvent.setup();
    renderApp("/admin/settings");
    const defaults = await region();
    const card = within(defaults);

    expect(await card.findByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("2");
    expect(card.getByRole("textbox", { name: en["limits.amount"] })).toHaveValue("10");
    await user.click(card.getByRole("button", { name: en["limits.add"] }));
    await user.type(row(defaults, 2).getByRole("textbox", { name: en["limits.windowCount"] }), "30");
    await user.selectOptions(row(defaults, 2).getByRole("combobox", { name: en["limits.windowUnit"] }), "minutes");
    await user.type(row(defaults, 2).getByRole("textbox", { name: en["limits.amount"] }), "1");
    await user.click(card.getByRole("button", { name: en["limits.save"] }));

    await waitFor(() =>
      expect(limitPuts).toEqual([
        [
          { windowMinutes: 120, amountUsd: 10 },
          { windowMinutes: 30, amountUsd: 1 },
        ],
      ]),
    );
    await waitFor(() =>
      expect(row(defaults, 1).getByRole("combobox", { name: en["limits.windowUnit"] })).toHaveValue("minutes"),
    );
    expect(row(defaults, 1).getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("30");
    expect(row(defaults, 2).getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("2");
  });

  it("says there are no default limits", async () => {
    settingsScreen();
    renderApp("/admin/settings");

    expect(await within(await region()).findByText(en["limits.none"])).toBeInTheDocument();
  });
});
  it("saves sticky sessions immediately without overwriting unrelated settings", async () => {
    settingsScreen();
    let settings = { yaml: "request-retry: 7\n", fields: { sessionAffinity: true, requestRetry: 7, proxyURL: "", maxRetryInterval: 30 } };
    server.use(
      http.get("/api/admin/providers", ({ response }) => response(200).json([fixtures.providerAccount()])),
      http.get("/api/admin/settings", ({ response }) => response(200).json(settings)),
      http.put("/api/admin/settings", async ({ request, response }) => {
        const body = await request.json();
        expect(body).toEqual({ fields: { sessionAffinity: false }, dryRun: false });
        settings = { ...settings, yaml: "request-retry: 7\nrouting:\n  session-affinity: false\n", fields: { ...settings.fields, ...body.fields } };
        return response(200).json({ settings, diff: "", applied: true });
      }),
    );
    const user = userEvent.setup();
    const view = renderApp("/admin/settings");
    const toggle = await screen.findByRole("switch", { name: en["settings.sessionAffinity"] });
    expect(toggle).toBeChecked();
    const retries = screen.getByLabelText(en["settings.requestRetry"]);
    await user.clear(retries);
    await user.type(retries, "8");
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(settings.fields.requestRetry).toBe(7);
    expect(retries).toHaveValue("8");
    await user.click(screen.getByRole("tab", { name: en["settings.yaml"] }));
    expect(screen.getByLabelText(en["settings.yamlLabel"])).toHaveValue(settings.yaml);
    view.unmount();
    const providerView = renderApp("/admin/providers");
    await screen.findByRole("combobox");
    expect(screen.queryByRole("switch", { name: en["settings.sessionAffinity"] })).not.toBeInTheDocument();
    providerView.unmount();
    renderApp("/admin/settings");
    expect(await screen.findByRole("switch", { name: en["settings.sessionAffinity"] })).not.toBeChecked();
  });
it("does not let an older settings read undo a successfully saved switch", async () => {
  settingsScreen();
  const oldSettings = { yaml: "", fields: { sessionAffinity: true } };
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const reading = new Promise<void>((resolve) => { started = resolve; });
  const user = userEvent.setup();
  const { queryClient } = renderApp("/admin/settings");
  await screen.findByRole("switch", { name: en["settings.sessionAffinity"] });
  server.use(
    http.get("/api/admin/settings", async ({ response }) => {
      started();
      await blocked;
      return response(200).json(oldSettings);
    }),
    http.put("/api/admin/settings", ({ response }) => response(200).json({
      applied: true, diff: "", settings: { yaml: "", fields: { sessionAffinity: false } },
    })),
  );
  const refetch = queryClient.refetchQueries({ queryKey: settingsQuery.queryKey });
  await reading;
  const toggle = screen.getByRole("switch", { name: en["settings.sessionAffinity"] });
  await user.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  await act(async () => { release(); await refetch; });
  expect(toggle).not.toBeChecked();
});

describe("unknown upstream error masking", () => {
  it("defaults on, saves explicit off, and preserves it without changing cost visibility", async () => {
    settingsScreen();
    let stored: Schemas["AdminConfig"] = { costsVisible: true, maskUnknownErrors: true };
    server.use(
      http.get("/api/admin/config", ({ response }) => response(200).json(stored)),
      http.put("/api/admin/config", async ({ request, response }) => {
        stored = { ...stored, ...await request.json() };
        return response(200).json(stored);
      }),
    );
    const user = userEvent.setup();
    const view = renderApp("/admin/settings");
    const toggle = await screen.findByRole("switch", { name: en["settings.maskUnknownErrors"] });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(stored.costsVisible).toBe(true);
    expect(screen.getByRole("switch", { name: en["settings.costsVisible"] })).toBeChecked();
    view.unmount();
    renderApp("/admin/settings");
    expect(await screen.findByRole("switch", { name: en["settings.maskUnknownErrors"] })).not.toBeChecked();
  });

  it("retains the saved preference after a failed write and shows a stable error", async () => {
    settingsScreen();
    server.use(http.put("/api/admin/config", ({ response }) => response.untyped(errorResponse(503, {
      code: "internal_error", message: "private provider diagnostics",
    }))));
    const user = userEvent.setup();
    renderApp("/admin/settings");
    const toggle = await screen.findByRole("switch", { name: en["settings.maskUnknownErrors"] });
    await user.click(toggle);
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private provider diagnostics");
    expect(toggle).toBeChecked();
  });
});
