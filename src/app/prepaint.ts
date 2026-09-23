// Explicit `.ts` extensions: this module is also loaded by Vite's config loader.
import {
  DEFAULT_LANG,
  DEFAULT_THEME,
  LANG_KEY,
  LANGS,
  THEME_KEY,
  THEMES,
} from "../shared/lib/preferences.ts";

interface PrepaintConfig {
  themeKey: string;
  langKey: string;
  themes: readonly string[];
  langs: readonly string[];
  defaultTheme: string;
  defaultLang: string;
}

// Serialised with Function.prototype.toString and inlined into index.html, so it
// must stay self-contained: no imports, no closures, only its arguments and
// syntax every supported browser parses without a bundler.
function prepaint(root: HTMLElement, storage: () => Storage, config: PrepaintConfig): void {
  let theme: string | null = null;
  let lang: string | null = null;
  try {
    // Reading the property itself throws where storage is disabled.
    const store = storage();
    theme = store.getItem(config.themeKey);
    lang = store.getItem(config.langKey);
  } catch {
    // Unavailable storage means defaults.
  }
  if (theme === null || config.themes.indexOf(theme) < 0) theme = config.defaultTheme;
  if (lang === null || config.langs.indexOf(lang) < 0) lang = config.defaultLang;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-lang", lang);
  root.setAttribute("lang", lang);
}

const config: PrepaintConfig = {
  themeKey: THEME_KEY,
  langKey: LANG_KEY,
  themes: THEMES,
  langs: LANGS,
  defaultTheme: DEFAULT_THEME,
  defaultLang: DEFAULT_LANG,
};

/**
 * The classic script inlined at the top of <head> by the Vite plugin in
 * vite.config.ts. It reads the globals `document` and `localStorage`; the test
 * takes it from the transformed index.html and runs it against substitutes for both.
 */
export const PREPAINT_SCRIPT = `(${prepaint.toString()})(document.documentElement,function(){return localStorage},${JSON.stringify(config)});`;
