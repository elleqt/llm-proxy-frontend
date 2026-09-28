import type { ReactNode } from "react";
import type { SpendWindow } from "../../entities/limits/limits";
import { useLang, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Badge, Meter } from "../../shared/ui";
import { money, windowText } from "./format";
import styles from "./SpendWindows.module.css";

/**
 * The limits in force with their windows: how much of each live window is
 * spent and when it ends, or that none is live yet. `actions` adds the
 * caller's controls (e.g. a reset) to each window.
 */
export function SpendWindows({
  windows,
  actions,
}: {
  windows: readonly SpendWindow[];
  actions?: (window: SpendWindow) => ReactNode;
}) {
  const t = useT();
  const [lang] = useLang();
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
  return (
    <ul className={styles.list}>
      {windows.map((window) => {
        const amount = money(window.amountUsd, lang);
        const per = fill(t("limits.per"), { amount, window: windowText(window.windowMinutes, t) });
        return (
          <li key={window.windowMinutes} className={styles.window}>
            <div className={styles.head}>
              <span className={styles.per}>{per}</span>
              {window.exhausted && <Badge tone="accent">{t("limits.exhausted")}</Badge>}
            </div>
            {window.startedAt === null || window.resetsAt === null ? (
              <p className={styles.dim}>{t("limits.opensWithRequest")}</p>
            ) : (
              <>
                <Meter label={per} value={window.spentUsd} max={window.amountUsd} />
                <p className={styles.numbers}>
                  <span>{fill(t("limits.spent"), { spent: money(window.spentUsd, lang), amount })}</span>
                  <span className={styles.dim}>
                    {fill(t("limits.resetsAt"), { when: dateTime.format(new Date(window.resetsAt)) })}
                  </span>
                </p>
              </>
            )}
            {actions?.(window)}
          </li>
        );
      })}
    </ul>
  );
}
