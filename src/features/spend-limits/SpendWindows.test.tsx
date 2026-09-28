import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { SpendWindow } from "../../entities/limits/limits";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fixtures } from "../../test/server";
import { SpendWindows } from "./SpendWindows";

function windows(list: readonly SpendWindow[], actions?: (window: SpendWindow) => ReactNode) {
  render(
    <I18nProvider>
      <SpendWindows windows={list} {...(actions === undefined ? {} : { actions })} />
    </I18nProvider>,
  );
  return screen.getAllByRole("listitem").map((item) => within(item));
}

const live = fixtures.spendWindow({
  spentUsd: 4,
  startedAt: "2026-09-28T10:00:00Z",
  resetsAt: "2026-09-28T12:00:00Z",
});

describe("SpendWindows", () => {
  it("says a window with none live opens with the first request", () => {
    const [item] = windows([fixtures.spendWindow()]);

    expect(item?.getByText("$10.00 per 2 hours")).toBeInTheDocument();
    expect(item?.getByText(en["limits.opensWithRequest"])).toBeInTheDocument();
    expect(item?.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("shows a live window's spending and when it resets", () => {
    const [item] = windows([live]);

    expect(item?.getByText("$4.00 of $10.00")).toBeInTheDocument();
    expect(item?.getByText(/^Resets \S/)).toBeInTheDocument();
    expect(item?.getByRole("meter", { name: "$10.00 per 2 hours" })).toHaveValue(4);
    expect(item?.queryByText(en["limits.opensWithRequest"])).not.toBeInTheDocument();
    expect(item?.queryByText(en["limits.exhausted"])).not.toBeInTheDocument();
  });

  it("marks an exhausted window", () => {
    const [item] = windows([{ ...live, spentUsd: 10, exhausted: true }]);

    expect(item?.getByText(en["limits.exhausted"])).toBeInTheDocument();
  });

  it("renders the caller's actions for each window", () => {
    const items = windows([fixtures.spendWindow(), { ...live, windowMinutes: 1440 }], (window) => (
      <button type="button">Reset {window.windowMinutes}</button>
    ));

    expect(items[0]?.getByRole("button", { name: "Reset 120" })).toBeInTheDocument();
    expect(items[1]?.getByRole("button", { name: "Reset 1440" })).toBeInTheDocument();
  });
});
