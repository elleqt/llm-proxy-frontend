import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { CopyButton } from "./CopyButton";

const YAML = "request-retry: 3\nmax-retry-interval: 30\n";

function renderButton() {
  render(
    <I18nProvider>
      <CopyButton value={YAML} />
    </I18nProvider>,
  );
}

describe("CopyButton", () => {
  it("copies the value through the clipboard API and confirms", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    await expect(navigator.clipboard.readText()).resolves.toBe(YAML);
    expect(screen.getByRole("button", { name: en["ui.copied"] })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(en["ui.copied"]);
  });

  it("when the clipboard refuses, tells the user to copy by hand", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    renderButton();

    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    expect(screen.getByRole("status")).toHaveTextContent(en["ui.copyFailedManual"]);
    expect(screen.getByRole("button", { name: en["ui.copy"] })).toBeInTheDocument();
  });
});
