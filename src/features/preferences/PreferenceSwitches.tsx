import { useState } from "react";
import { useLang, useT } from "../../shared/i18n";
import { applyTheme, currentTheme, LANGS, THEMES } from "../../shared/lib/preferences";
import styles from "./PreferenceSwitches.module.css";

export function PreferenceSwitches() {
  const t = useT();
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useState(currentTheme);

  return (
    <div className={styles.switches}>
      <div role="group" aria-label={t("prefs.theme")} className={styles.group}>
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
      <div role="group" aria-label={t("prefs.lang")} className={styles.group}>
        {LANGS.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.button}
            aria-pressed={value === lang}
            onClick={() => setLang(value)}
          >
            {t(`prefs.lang.${value}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
