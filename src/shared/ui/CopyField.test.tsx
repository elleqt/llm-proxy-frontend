import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { ru } from "../i18n/ru";
import { CopyField } from "./CopyField";

const SECRET = "sk-test-0123456789abcdef";

function renderField() {
  render(
    <I18nProvider>
      <CopyField label="New key" value={SECRET} />
    </I18nProvider>,
  );
}

describe("CopyField", () => {
  it("shows the value and warns that it will not be shown again", () => {
    renderField();

    const field = screen.getByRole("group", { name: "New key" });
    expect(field).toHaveTextContent(SECRET);
    expect(field).toHaveAccessibleDescription(en["ui.shownOnce"]);
  });

  it("describes the field by a caller's own warning instead", () => {
    render(
      <I18nProvider>
        <CopyField label="Sign-in link" value="https://example.com/device" warning="Open it before the countdown ends." />
      </I18nProvider>,
    );

    expect(screen.getByRole("group", { name: "Sign-in link" })).toHaveAccessibleDescription(
      "Open it before the countdown ends.",
    );
  });

  it("copies the value through the clipboard API and confirms", async () => {
    const user = userEvent.setup();
    renderField();

    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    await expect(navigator.clipboard.readText()).resolves.toBe(SECRET);
    expect(screen.getByRole("button", { name: en["ui.copied"] })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(en["ui.copied"]);
  });

  it("when the clipboard refuses, selects the value and tells the user to copy it", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    renderField();

    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    expect(screen.getByRole("status")).toHaveTextContent(en["ui.copyFailed"]);
    expect(screen.getByRole("textbox", { name: "New key" })).toHaveFocus();
    expect(document.getSelection()?.toString()).toBe(SECRET);
  });

  it("lets the keyboard reach the value with it selected", async () => {
    const user = userEvent.setup();
    renderField();

    await user.tab();

    expect(screen.getByRole("textbox", { name: "New key" })).toHaveFocus();
    expect(document.getSelection()?.toString()).toBe(SECRET);
  });

  it("speaks the interface language", () => {
    document.documentElement.setAttribute("data-lang", "ru");
    renderField();

    expect(screen.getByRole("button", { name: ru["ui.copy"] })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "New key" })).toHaveAccessibleDescription(ru["ui.shownOnce"]);
  });
});
