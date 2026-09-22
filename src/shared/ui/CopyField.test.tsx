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

  it("copies the value through the clipboard API and confirms", async () => {
    const user = userEvent.setup();
    renderField();

    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    await expect(navigator.clipboard.readText()).resolves.toBe(SECRET);
    expect(screen.getByRole("button", { name: en["ui.copied"] })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(en["ui.copied"]);
  });

  it("tells the user to copy by hand when the clipboard refuses", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    renderField();

    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    expect(screen.getByRole("status")).toHaveTextContent(en["ui.copyFailed"]);
    expect(screen.getByRole("button", { name: en["ui.copy"] })).toBeInTheDocument();
  });

  it("speaks the interface language", () => {
    document.documentElement.setAttribute("data-lang", "ru");
    renderField();

    expect(screen.getByRole("button", { name: ru["ui.copy"] })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "New key" })).toHaveAccessibleDescription(ru["ui.shownOnce"]);
  });
});
