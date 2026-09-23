import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { ru } from "../../shared/i18n/ru";
import { PreferenceSwitches } from "./PreferenceSwitches";

function renderSwitches() {
  render(
    <I18nProvider>
      <PreferenceSwitches />
    </I18nProvider>,
  );
}

describe("preference switches", () => {
  it("start from what the pre-paint script applied", () => {
    document.documentElement.setAttribute("data-theme", "pink");
    document.documentElement.setAttribute("data-lang", "ru");
    renderSwitches();

    const themes = within(screen.getByRole("group", { name: ru["prefs.theme"] }));
    expect(themes.getByRole("button", { name: ru["prefs.theme.pink"] })).toHaveAttribute("aria-pressed", "true");
    expect(themes.getByRole("button", { name: ru["prefs.theme.auto"] })).toHaveAttribute("aria-pressed", "false");
  });

  it("show the languages by their own names, Russian first", () => {
    renderSwitches();
    const langs = within(screen.getByRole("group", { name: en["prefs.lang"] })).getAllByRole("button");
    expect(langs.map((button) => button.textContent)).toEqual(["Русский", "English"]);
  });

  it("switch the theme on <html> and in storage", async () => {
    renderSwitches();
    const dark = screen.getByRole("button", { name: en["prefs.theme.dark"] });

    await userEvent.click(dark);

    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: en["prefs.theme.auto"] })).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("still switch when storage refuses to write", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    renderSwitches();

    await userEvent.click(screen.getByRole("button", { name: en["prefs.theme.pink"] }));
    await userEvent.click(screen.getByRole("button", { name: en["prefs.lang.ru"] }));

    expect(document.documentElement).toHaveAttribute("data-theme", "pink");
    expect(document.documentElement).toHaveAttribute("data-lang", "ru");
    expect(screen.getByRole("button", { name: ru["prefs.theme.pink"] })).toHaveAttribute("aria-pressed", "true");
  });

  it("switch the language on <html>, in storage, in the text and in the title", async () => {
    renderSwitches();
    expect(document.title).toBe(en["app.title"]);

    await userEvent.click(screen.getByRole("button", { name: en["prefs.lang.ru"] }));

    expect(document.documentElement).toHaveAttribute("data-lang", "ru");
    expect(document.documentElement).toHaveAttribute("lang", "ru");
    expect(localStorage.getItem("lang")).toBe("ru");
    expect(document.title).toBe(ru["app.title"]);
    expect(screen.getByRole("group", { name: ru["prefs.theme"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ru["prefs.lang.ru"] })).toHaveAttribute("aria-pressed", "true");
  });
});
