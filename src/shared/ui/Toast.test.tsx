import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { TOAST_TIMEOUT_MS, ToastProvider, useToast } from "./Toast";

function Saver() {
  const notify = useToast();
  return (
    <button type="button" onClick={() => notify("Settings saved")}>
      Save
    </button>
  );
}

function renderSaver() {
  render(
    <I18nProvider>
      <ToastProvider>
        <Saver />
      </ToastProvider>
    </I18nProvider>,
  );
  return within(screen.getByRole("region", { name: en["ui.notifications"] }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("announces a message politely and removes it after a while", () => {
    vi.useFakeTimers();
    const region = renderSaver();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const message = region.getByText("Settings saved");
    expect(message.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");

    act(() => vi.advanceTimersByTime(TOAST_TIMEOUT_MS - 1));
    expect(region.getByText("Settings saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(region.queryByText("Settings saved")).not.toBeInTheDocument();
  });

  it("can be dismissed before it times out", () => {
    const region = renderSaver();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    fireEvent.click(region.getByRole("button", { name: en["ui.dismiss"] }));

    expect(region.queryByText("Settings saved")).not.toBeInTheDocument();
  });
});
