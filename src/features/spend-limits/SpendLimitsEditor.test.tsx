import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpendLimit } from "../../entities/limits/limits";
import { ApiError } from "../../shared/api/client";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fill } from "../../shared/lib/template";
import { SpendLimitsEditor } from "./SpendLimitsEditor";

/** The editor as a caller holds it; `refuse` hands it the failure of the last save. */
function editor(value: readonly SpendLimit[]) {
  const onSave = vi.fn();
  const onEdit = vi.fn();
  const view = (error: unknown) => (
    <I18nProvider>
      <SpendLimitsEditor
        value={value}
        onSave={onSave}
        onEdit={onEdit}
        saving={false}
        error={error}
        emptyLabel="Nothing is limited."
      />
    </I18nProvider>
  );
  const { rerender } = render(view(null));
  return { onSave, onEdit, user: userEvent.setup(), refuse: (error: unknown) => rerender(view(error)) };
}

const row = (n: number) => within(screen.getByRole("group", { name: fill(en["limits.row"], { n }) }));
const save = () => screen.getByRole("button", { name: en["limits.save"] });
const amountOf = (n: number) => row(n).getByRole("textbox", { name: en["limits.amount"] });

describe("SpendLimitsEditor", () => {
  it("shows a window as a count of its largest whole unit", () => {
    editor([{ windowMinutes: 120, amountUsd: 10 }]);

    expect(row(1).getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("2");
    expect(row(1).getByRole("combobox", { name: en["limits.windowUnit"] })).toHaveValue("hours");
  });

  it("names the unit in the form the typed count takes", async () => {
    const { user } = editor([{ windowMinutes: 1440, amountUsd: 10 }]);
    const unit = row(1).getByRole("combobox", { name: en["limits.windowUnit"] });

    expect(within(unit).getByRole("option", { selected: true })).toHaveTextContent(en["limits.unit.days.one"]);
    const count = row(1).getByRole("textbox", { name: en["limits.windowCount"] });
    await user.clear(count);
    await user.type(count, "3");
    expect(within(unit).getByRole("option", { selected: true })).toHaveTextContent(en["limits.unit.days.other"]);
  });

  it("saves an amount typed with a decimal comma", async () => {
    const { onSave, user } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    await user.clear(amountOf(1));
    await user.type(amountOf(1), "12,5");
    await user.click(save());

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith([{ windowMinutes: 120, amountUsd: 12.5 }]);
  });

  it("refuses a second limit on the same window, marking the later row", async () => {
    const { onSave, user } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    await user.click(screen.getByRole("button", { name: en["limits.add"] }));
    await user.type(row(2).getByRole("textbox", { name: en["limits.windowCount"] }), "2");
    await user.selectOptions(row(2).getByRole("combobox", { name: en["limits.windowUnit"] }), "hours");
    await user.type(amountOf(2), "5");
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
    await user.clear(amountOf(1));
    await user.type(amountOf(1), "0");
    await user.click(save());

    expect(count).toHaveAccessibleDescription(en["limits.windowInvalid"]);
    expect(amountOf(1)).toHaveAccessibleDescription(en["limits.amountInvalid"]);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("puts a server refusal naming a row's field under that field", async () => {
    const { user, refuse } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    await user.click(save());
    refuse(new ApiError(422, "invalid_input", "[0].amountUsd"));

    expect(amountOf(1)).toHaveAccessibleDescription(en["error.invalid_input"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a refusal on the row that was submitted, after an earlier row is removed", async () => {
    const { user, refuse } = editor([
      { windowMinutes: 60, amountUsd: 1 },
      { windowMinutes: 1440, amountUsd: 5 },
    ]);

    await user.click(save());
    refuse(new ApiError(422, "invalid_input", "[1].amountUsd"));
    await user.click(row(1).getByRole("button", { name: en["limits.remove"] }));

    expect(row(1).getByRole("textbox", { name: en["limits.windowCount"] })).toHaveValue("1");
    expect(amountOf(1)).toHaveAccessibleDescription(en["error.invalid_input"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a refusal about a removed row for the whole form", async () => {
    const { user, refuse } = editor([
      { windowMinutes: 60, amountUsd: 1 },
      { windowMinutes: 1440, amountUsd: 5 },
    ]);

    await user.click(save());
    refuse(new ApiError(422, "invalid_input", "[1].amountUsd"));
    await user.click(row(2).getByRole("button", { name: en["limits.remove"] }));

    expect(screen.getByRole("alert")).toHaveTextContent(en["error.invalid_input"]);
    expect(amountOf(1)).not.toHaveAccessibleDescription();
  });

  it("shows any other failure for the whole form", () => {
    const { refuse } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    refuse(new ApiError(500, "internal"));

    expect(screen.getByRole("alert")).toHaveTextContent(en["error.internal"]);
  });

  it("reports every change to the rows, so the caller can drop a refusal made about the old ones", async () => {
    const { onEdit, user } = editor([{ windowMinutes: 120, amountUsd: 10 }]);

    await user.type(amountOf(1), "5");
    expect(onEdit).toHaveBeenCalledTimes(1);
    await user.selectOptions(row(1).getByRole("combobox", { name: en["limits.windowUnit"] }), "days");
    await user.click(screen.getByRole("button", { name: en["limits.add"] }));
    await user.click(row(2).getByRole("button", { name: en["limits.remove"] }));
    expect(onEdit).toHaveBeenCalledTimes(4);
    await user.click(save());
    expect(onEdit).toHaveBeenCalledTimes(4);
  });

  it("saves no limits once every row is removed, and says so with the empty label", async () => {
    const { onSave, user } = editor([
      { windowMinutes: 60, amountUsd: 1 },
      { windowMinutes: 1440, amountUsd: 5 },
    ]);

    for (const button of screen.getAllByRole("button", { name: en["limits.remove"] })) await user.click(button);
    expect(screen.getByText("Nothing is limited.")).toBeInTheDocument();
    await user.click(save());

    expect(onSave).toHaveBeenCalledOnce();
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
