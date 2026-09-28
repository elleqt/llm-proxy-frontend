import type { ReactNode } from "react";
import type { SpendWindow } from "../../entities/limits/limits";
import { useLang, useT } from "../../shared/i18n";
import { formatUSD } from "../../shared/lib/money";
import { fill } from "../../shared/lib/template";
import { Badge, Meter } from "../../shared/ui";
import { windowText } from "./format";
import styles from "./SpendWindows.module.css";

/**
 * The limits in force with their windows: how much of each live window is
 * spent, when it started and when it ends, or that none is live yet.
 * `actions` adds the caller's controls (e.g. a reset) to each window; `per`
 * is the window's name as shown, for labels that must say which one.
 */
export function SpendWindows({
  windows,
  actions,
}: {
  windows: readonly SpendWindow[];
  actions?: (window: SpendWindow, per: string) => ReactNode;
}) {
  const t = useT();
  const [lang] = useLang();
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
  return (
    <ul className={styles.list}>
      {windows.map((window) => {
        const amount = formatUSD(lang, window.amountUsd);
        const per = fill(t("limits.per"), { amount, window: windowText(window.windowMinutes, t, lang) });
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
                  <span>{fill(t("limits.spent"), { spent: formatUSD(lang, window.spentUsd), amount })}</span>
                  <span className={`${styles.dim} ${styles.times}`}>
                    <span>{fill(t("limits.startedAt"), { when: dateTime.format(new Date(window.startedAt)) })}</span>
                    <span>{fill(t("limits.resetsAt"), { when: dateTime.format(new Date(window.resetsAt)) })}</span>
                  </span>
                </p>
              </>
            )}
            {actions?.(window, per)}
          </li>
        );
      })}
    </ul>
  );
}
