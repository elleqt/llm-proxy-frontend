import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpendLimit } from "../../entities/limits/limits";
import { ApiError } from "../../shared/api/client";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fill } from "../../shared/lib/template";
import { SpendLimitsEditor } from "./SpendLimitsEditor";

function editor(value: readonly SpendLimit[], error: unknown = null) {
  const onSave = vi.fn();
  render(
    <I18nProvider>
      <SpendLimitsEditor value={value} onSave={onSave} saving={false} error={error} emptyLabel="Nothing is limited." />
    </I18nProvider>,
  );
  return { onSave, user: userEvent.setup() };
}

const row = (n: number) => within(screen.getByRole("group", { name: fill(en["limits.row"], { n }) }));
const save = () => screen.getByRole("button", { name: en["limits.save"] });

describe("SpendLimitsEditor", () => {
  it("shows a window as a count of its largest whole unit", () => {
    editor([{ windowMinutes: 120, amountUsd: 10 }]);

    expect(row(1).getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("2");
    expect(row(1).getByRole("combobox", { name: en["limits.windowUnit"] })).toHaveValue("hours");
  });

  it("saves an amount typed with a decimal comma", async () => {
    const { onSave, user } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    const amount = row(1).getByRole("textbox", { name: en["limits.amount"] });
    await user.clear(amount);
    await user.type(amount, "12,5");
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith([{ windowMinutes: 120, amountUsd: 12.5 }]);
  });

  it("refuses a second limit on the same window, marking the later row", async () => {
    const { onSave, user } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    await user.click(screen.getByRole("button", { name: en["limits.add"] }));
    await user.type(row(2).getByRole("textbox", { name: en["limits.windowCount"] }), "2");
    await user.selectOptions(row(2).getByRole("combobox", { name: en["limits.windowUnit"] }), "hours");
    await user.type(row(2).getByRole("textbox", { name: en["limits.amount"] }), "5");
    await user.click(save());

    expect(row(2).getByRole("textbox", { name: en["limits.windowCount"] })).toHaveAccessibleDescription(
      en["limits.duplicate"],
    );
    expect(row(1).queryByText(en["limits.duplicate"])).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("refuses a window beyond 365 days and an amount of 0", async () => {
    const { onSave, user } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    const count = row(1).getByRole("textbox", { name: en["limits.windowCount"] });
    await user.clear(count);
    await user.type(count, "366");
    await user.selectOptions(row(1).getByRole("combobox", { name: en["limits.windowUnit"] }), "days");
    const amount = row(1).getByRole("textbox", { name: en["limits.amount"] });
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(save());

    expect(count).toHaveAccessibleDescription(en["limits.windowInvalid"]);
    expect(amount).toHaveAccessibleDescription(en["limits.amountInvalid"]);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("puts a server refusal naming a row's field under that field", () => {
    editor([{ windowMinutes: 120, amountUsd: 10 }], new ApiError(422, "invalid_input", "[0].amountUsd"));

    expect(row(1).getByRole("textbox", { name: en["limits.amount"] })).toHaveAccessibleDescription(
      en["error.invalid_input"],
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows any other failure for the whole form", () => {
    editor([{ windowMinutes: 120, amountUsd: 10 }], new ApiError(500, "internal"));

    expect(screen.getByRole("alert")).toHaveTextContent(en["error.internal"]);
  });

  it("saves no limits once every row is removed, and says so with the empty label", async () => {
    const { onSave, user } = editor([
      { windowMinutes: 60, amountUsd: 1 },
      { windowMinutes: 1440, amountUsd: 5 },
    ]);

    for (const button of screen.getAllByRole("button", { name: en["limits.remove"] })) await user.click(button);
    expect(screen.getByText("Nothing is limited.")).toBeInTheDocument();
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("shows the empty label without rows", () => {
    editor([]);

    expect(screen.getByText("Nothing is limited.")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("offers no eleventh limit", () => {
    editor(Array.from({ length: 10 }, (_, i) => ({ windowMinutes: i + 1, amountUsd: 1 })));

    expect(screen.getByRole("button", { name: en["limits.add"] })).toBeDisabled();
  });
});
