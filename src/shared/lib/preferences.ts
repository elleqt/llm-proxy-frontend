// Display preferences, the only things the client keeps in localStorage: theme
// and language, which the pre-paint script (src/app/prepaint.ts) applies before
// first paint, and the usage chart's unit. Everything here keeps the <html>
// attributes and storage in step afterwards.

export const THEMES = ["auto", "light", "pink", "dark"] as const;
export const LANGS = ["en", "ru"] as const;
/** The order the language switch shows them in, as on the instruction page. */
export const LANG_DISPLAY_ORDER: readonly Lang[] = ["ru", "en"];

export type Theme = (typeof THEMES)[number];
export type Lang = (typeof LANGS)[number];

export const DEFAULT_THEME: Theme = "auto";
export const DEFAULT_LANG: Lang = "en";

export const THEME_KEY = "theme";
export const LANG_KEY = "lang";

export function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value);
}

export function isLang(value: unknown): value is Lang {
  return (LANGS as readonly unknown[]).includes(value);
}

/** The theme the pre-paint script settled on. */
export function currentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** The language the pre-paint script settled on. */
export function currentLang(): Lang {
  const value = document.documentElement.getAttribute("data-lang");
  return isLang(value) ? value : DEFAULT_LANG;
}

/** What the usage chart plots; remembered like the theme. */
export const USAGE_UNITS = ["tokens", "usd"] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];
export const USAGE_UNIT_KEY = "usageUnit";

export function storedUsageUnit(): UsageUnit {
  try {
    const value = localStorage.getItem(USAGE_UNIT_KEY);
    return (USAGE_UNITS as readonly unknown[]).includes(value) ? (value as UsageUnit) : "tokens";
  } catch {
    return "tokens";
  }
}

export function storeUsageUnit(unit: UsageUnit): void {
  persist(USAGE_UNIT_KEY, unit);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  persist(THEME_KEY, theme);
}

export function applyLang(lang: Lang): void {
  const root = document.documentElement;
  root.setAttribute("data-lang", lang);
  root.setAttribute("lang", lang);
  persist(LANG_KEY, lang);
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, disabled): the choice lasts for this page only.
  }
}
