import { useId, useState } from "react";
import { useLang, useT } from "../../shared/i18n";
import { applyTheme, currentTheme, LANG_DISPLAY_ORDER, THEMES } from "../../shared/lib/preferences";
import styles from "./PreferenceSwitches.module.css";

export function PreferenceSwitches() {
  const t = useT();
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useState(currentTheme);
  const themeCaption = useId();
  const langCaption = useId();

  return (
    <nav className={styles.switches}>
      <div role="group" aria-labelledby={themeCaption} className={styles.group}>
        <b id={themeCaption} className={styles.caption}>
          {t("prefs.theme")}
        </b>
        {THEMES.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.button}
            aria-pressed={value === theme}
            onClick={() => {
              applyTheme(value);
              setTheme(value);
            }}
          >
            {t(`prefs.theme.${value}`)}
          </button>
        ))}
      </div>
      <div role="group" aria-labelledby={langCaption} className={styles.group}>
        <b id={langCaption} className={styles.caption}>
          {t("prefs.lang")}
        </b>
        {LANG_DISPLAY_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            lang={value}
            className={styles.button}
            aria-pressed={value === lang}
            onClick={() => setLang(value)}
          >
            {t(`prefs.lang.${value}`)}
          </button>
        ))}
      </div>
    </nav>
  );
}
