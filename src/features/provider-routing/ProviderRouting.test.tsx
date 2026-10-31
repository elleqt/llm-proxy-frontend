import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { settingsQuery } from "../../entities/settings/settings";
import { en } from "../../shared/i18n/en";
import { renderApp } from "../../test/render";
import { errorResponse, fixtures, http, server } from "../../test/server";

function providers(priority = 0, provider = "chatgpt") {
  let account = fixtures.providerAccount({ id: "routing-account", provider, label: "routing-test", priority });
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/providers", ({ response }) => response(200).json([account])),
    http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
      const body = await request.json();
      account = { ...account, ...body, proxy: account.proxy };
      return response(200).json(account);
    }),
  );
  return () => account;
}

const role = () => screen.findByRole("combobox", { name: `${en["routing.role"]} · routing-test` });

describe("provider routing", () => {
  it.each(["chatgpt", "claude"])("saves a %s role immediately and retains it when the editor opens", async (provider) => {
    const stored = providers(0, provider);
    const user = userEvent.setup();
    renderApp("/admin/providers");
    await user.selectOptions(await role(), "-1");
    await waitFor(() => expect(stored().priority).toBe(-1));
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Edit routing-test" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox")).toHaveValue("-1");
    expect(within(dialog).getByRole("button", { name: en["providers.save"] })).toBeDisabled();
  });

  it("preserves a custom priority until an explicit preset is selected", async () => {
    const stored = providers(7);
    const user = userEvent.setup();
    renderApp("/admin/providers");
    expect(await role()).toHaveValue("7");
    expect(stored().priority).toBe(7);
    await user.selectOptions(await role(), "0");
    await waitFor(() => expect(stored().priority).toBe(0));
  });

  it("keeps the saved role and displays a stable error after a refusal", async () => {
    const stored = providers(1);
    server.use(http.patch("/api/admin/providers/{accountId}", ({ response }) => response.untyped(errorResponse(503, { code: "unavailable", message: "private upstream detail" }))));
    const user = userEvent.setup();
    renderApp("/admin/providers");
    await user.selectOptions(await role(), "-1");
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private upstream detail");
    expect(await role()).toHaveValue("1");
    expect(stored().priority).toBe(1);
  });

  it("saves sticky sessions immediately without overwriting unrelated settings", async () => {
    providers();
    let settings = { yaml: "request-retry: 7\n", fields: { sessionAffinity: true, requestRetry: 7, proxyURL: "", maxRetryInterval: 30 } };
    server.use(
      http.get("/api/admin/settings", ({ response }) => response(200).json(settings)),
      http.put("/api/admin/settings", async ({ request, response }) => {
        const body = await request.json();
        expect(body).toEqual({ fields: { sessionAffinity: false }, dryRun: false });
        settings = { ...settings, fields: { ...settings.fields, ...body.fields } };
        return response(200).json({ settings, diff: "", applied: true });
      }),
    );
    const user = userEvent.setup();
    const view = renderApp("/admin/providers");
    const toggle = await screen.findByRole("switch", { name: en["settings.sessionAffinity"] });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(settings.fields.requestRetry).toBe(7);
    view.unmount();
    renderApp("/admin/providers");
    expect(await screen.findByRole("switch", { name: en["settings.sessionAffinity"] })).not.toBeChecked();
  });
});

it("does not let an older settings read undo a successfully saved switch", async () => {
  providers();
  const oldSettings = { yaml: "", fields: { sessionAffinity: true } };
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const reading = new Promise<void>((resolve) => { started = resolve; });
  const user = userEvent.setup();
  const { queryClient } = renderApp("/admin/providers");
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
