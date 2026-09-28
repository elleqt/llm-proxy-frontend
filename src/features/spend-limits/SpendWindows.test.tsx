import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { SpendWindow } from "../../entities/limits/limits";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fill } from "../../shared/lib/template";
import { fixtures } from "../../test/server";
import { SpendWindows } from "./SpendWindows";

function windows(list: readonly SpendWindow[], actions?: (window: SpendWindow, per: string) => ReactNode) {
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
const when = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

describe("SpendWindows", () => {
  it("says a window with none live opens with the first request", () => {
    const [item] = windows([fixtures.spendWindow()]);

    expect(item?.getByText("$10.00 per 2 hours")).toBeInTheDocument();
    expect(item?.getByText(en["limits.opensWithRequest"])).toBeInTheDocument();
    expect(item?.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("shows a live window's spending, when it started and when it resets", () => {
    const [item] = windows([live]);

    expect(item?.getByText("$4.00 of $10.00")).toBeInTheDocument();
    expect(item?.getByText(fill(en["limits.startedAt"], { when: when("2026-09-28T10:00:00Z") }))).toBeInTheDocument();
    expect(item?.getByText(fill(en["limits.resetsAt"], { when: when("2026-09-28T12:00:00Z") }))).toBeInTheDocument();
    expect(item?.getByRole("meter", { name: "$10.00 per 2 hours" })).toHaveValue(4);
    expect(item?.queryByText(en["limits.opensWithRequest"])).not.toBeInTheDocument();
    expect(item?.queryByText(en["limits.exhausted"])).not.toBeInTheDocument();
  });

  it("shows spending below a dollar as precisely as the usage figures", () => {
    const [item] = windows([{ ...live, spentUsd: 0.0034 }]);

    expect(item?.getByText("$0.0034 of $10.00")).toBeInTheDocument();
  });

  it("marks an exhausted window", () => {
    const [item] = windows([{ ...live, spentUsd: 10, exhausted: true }]);

    expect(item?.getByText(en["limits.exhausted"])).toBeInTheDocument();
  });

  it("renders the caller's actions for each window, given the window's name", () => {
    const items = windows([fixtures.spendWindow(), { ...live, windowMinutes: 1440 }], (_window, per) => (
      <button type="button">Reset {per}</button>
    ));

    expect(items[0]?.getByRole("button", { name: "Reset $10.00 per 2 hours" })).toBeInTheDocument();
    expect(items[1]?.getByRole("button", { name: "Reset $10.00 per 1 day" })).toBeInTheDocument();
  });
});
