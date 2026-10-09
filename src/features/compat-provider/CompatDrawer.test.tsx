import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/queryClient";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fixtures, http, server, type Schemas } from "../../test/server";
import { CompatDrawer } from "./CompatProvider";

type Compat = NonNullable<Schemas["ProviderAccount"]["compat"]>;

/** The drawer of a stored provider with a key and the given models; collects the PUT bodies. */
function drawer(models: Compat["models"]) {
  const sent: Schemas["CompatProviderUpdate"][] = [];
  const account = fixtures.providerAccount({
    id: "openai-compatible-acme",
    provider: "acme",
    label: "acme",
    email: null,
    quota: [],
    compat: { name: "acme", baseURL: "https://api.example.com/v1", hasApiKey: true, models },
  });
  server.use(
    http.put("/api/admin/providers/compat/{accountId}", async ({ request, response }) => {
      sent.push(await request.json());
      return response(200).json(account);
    }),
  );
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient(() => undefined)}>
      <I18nProvider>
        <CompatDrawer account={account} onClose={onClose} removeAction={null} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { sent, onClose, user: userEvent.setup() };
}

const dialog = () => screen.getByRole("dialog", { name: "acme" });
const advanced = () => within(dialog()).getByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) });
const chip = (level: string) => within(dialog()).getByRole("button", { name: level });
const save = () => within(dialog()).getByRole("button", { name: en["compat.saveEdit"] });
/** The models of the one PUT sent, once the drawer has closed after it. */
async function savedModels(sent: Schemas["CompatProviderUpdate"][], onClose: () => void) {
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(sent).toHaveLength(1);
  return sent[0]?.models;
}

describe("CompatDrawer reasoning levels", () => {
  it("shows a uniform own list, and an untouched block gives a model added by name that list too", async () => {
    const { user, sent, onClose } = drawer([
      { name: "model-a", reasoningLevels: ["low", "high"] },
      { name: "model-b", reasoningLevels: ["high", "low"] },
    ]);

    expect(await within(dialog()).findByText(`${en["compat.levels"]}: ${en["compat.levelsOwn"]}`)).toBeInTheDocument();
    await user.click(advanced());
    expect(advanced()).toHaveAttribute("aria-expanded", "true");
    expect(chip("low")).toHaveAttribute("aria-pressed", "true");
    expect(chip("high")).toHaveAttribute("aria-pressed", "true");
    expect(chip("medium")).toHaveAttribute("aria-pressed", "false");

    await user.type(within(dialog()).getByLabelText(en["compat.addModel"]), "model-c");
    await user.click(within(dialog()).getByRole("button", { name: en["compat.addModelButton"] }));
    await user.click(save());

    expect(await savedModels(sent, onClose)).toEqual([
      { name: "model-a", reasoningLevels: ["low", "high"] },
      { name: "model-b", reasoningLevels: ["high", "low"] },
      { name: "model-c", reasoningLevels: ["low", "high"] },
    ]);
  });

  it("leaves mixed lists unchecked, and an untouched block keeps each model's own list", async () => {
    const { user, sent, onClose } = drawer([
      { name: "model-a", reasoningLevels: ["low"] },
      { name: "model-b" },
      { name: "model-c", reasoningLevels: ["high", "max"] },
    ]);

    expect(await within(dialog()).findByText(`${en["compat.levels"]}: ${en["compat.levelsMixed"]}`)).toBeInTheDocument();
    await user.click(advanced());
    for (const level of ["none", "low", "high", "max", "auto"]) expect(chip(level)).toHaveAttribute("aria-pressed", "false");

    // A model added by name follows the default while the models differ.
    await user.type(within(dialog()).getByLabelText(en["compat.addModel"]), "model-d");
    await user.click(within(dialog()).getByRole("button", { name: en["compat.addModelButton"] }));
    await user.click(save());

    expect(await savedModels(sent, onClose)).toEqual([
      { name: "model-a", reasoningLevels: ["low"] },
      { name: "model-b" },
      { name: "model-c", reasoningLevels: ["high", "max"] },
      { name: "model-d" },
    ]);
  });

  it("gives every picked model the list once the block is touched", async () => {
    const { user, sent, onClose } = drawer([{ name: "model-a", reasoningLevels: ["low"] }, { name: "model-b" }]);

    await user.click(await within(dialog()).findByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) }));
    await user.click(chip("high"));
    await user.click(chip("low"));
    expect(within(dialog()).getByText(`${en["compat.levels"]}: ${en["compat.levelsOwn"]}`)).toBeInTheDocument();
    await user.click(save());

    expect(await savedModels(sent, onClose)).toEqual([
      { name: "model-a", reasoningLevels: ["low", "high"] },
      { name: "model-b", reasoningLevels: ["low", "high"] },
    ]);
  });

  it("sends no list once Reset returns the block to the default set", async () => {
    const { user, sent, onClose } = drawer([
      { name: "model-a", reasoningLevels: ["low", "high"] },
      { name: "model-b", reasoningLevels: ["low", "high"] },
    ]);

    await user.click(await within(dialog()).findByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) }));
    await user.click(within(dialog()).getByRole("button", { name: en["compat.levelsReset"] }));
    expect(chip("medium")).toHaveAttribute("aria-pressed", "true");
    expect(chip("auto")).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog()).getByText(`${en["compat.levels"]}: ${en["compat.levelsDefault"]}`)).toBeInTheDocument();
    await user.click(save());

    expect(await savedModels(sent, onClose)).toEqual([{ name: "model-a" }, { name: "model-b" }]);
  });

  it("refuses an empty list in the Advanced section, opening it", async () => {
    const { user, sent, onClose } = drawer([{ name: "model-a", reasoningLevels: ["low"] }]);

    await user.click(await within(dialog()).findByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) }));
    await user.click(chip("low"));
    await user.click(advanced());
    expect(advanced()).toHaveAttribute("aria-expanded", "false");
    await user.click(save());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(en["compat.pickLevels"]);
    expect(advanced()).toHaveAttribute("aria-expanded", "true");
    expect(sent).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains the levels in a tooltip that Escape closes without closing the drawer", async () => {
    const { user, onClose } = drawer([{ name: "model-a" }]);

    await user.click(await within(dialog()).findByRole("button", { name: new RegExp(`^${en["compat.advanced"]}`) }));
    const help = within(dialog()).getByRole("button", { name: en["compat.levelsHelp"] });
    expect(help).toHaveAccessibleDescription(en["compat.levelsHint"].replaceAll("`", ""));
    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });
});

describe("CompatDrawer unsaved changes", () => {
  it("closes a clean drawer on Escape at once", async () => {
    const { user, onClose } = drawer([{ name: "model-a" }]);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: en["ui.discardTitle"] })).toBeNull();
  });

  it("asks before dropping a typed key, and Keep editing keeps it", async () => {
    const { user, onClose } = drawer([{ name: "model-a" }]);
    const key = within(dialog()).getByRole("group", { name: en["compat.apiKey"] });
    expect(within(key).getByText(en["compat.keyStored"])).toBeInTheDocument();
    expect(save()).toBeDisabled();

    await user.click(within(key).getByRole("button", { name: en["compat.keyReplace"] }));
    await user.type(within(dialog()).getByLabelText(en["compat.apiKey"]), "sk-compat-example-key");
    await user.keyboard("{Escape}");

    expect(await screen.findByRole("dialog", { name: en["ui.discardTitle"] })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en["ui.keepEditing"] }));
    expect(screen.queryByRole("dialog", { name: en["ui.discardTitle"] })).toBeNull();
    expect(within(dialog()).getByLabelText(en["compat.apiKey"])).toHaveValue("sk-compat-example-key");
    expect(onClose).not.toHaveBeenCalled();
  });
});
