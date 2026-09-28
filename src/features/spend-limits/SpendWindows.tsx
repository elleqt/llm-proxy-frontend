import type { ReactNode } from "react";
import type { MySpendWindow } from "../../entities/limits/limits";
import { useLang, useT } from "../../shared/i18n";
import { formatUSD } from "../../shared/lib/money";
import { fill } from "../../shared/lib/template";
import { Badge, Meter } from "../../shared/ui";
import { windowText } from "./format";
import styles from "./SpendWindows.module.css";

/**
 * The limits in force with their windows: how much of each live window is
 * spent, when it started and when it ends, or that none is live yet. The share
 * spent is always shown; the dollars only when the window carries them (an
 * administrator's `SpendWindow` always does, a user's `MySpendWindow` only while
 * costs are visible to users). `actions` adds the caller's controls (e.g. a
 * reset) to each window; `per` is the window's name as shown, for labels that
 * must say which one.
 */
export function SpendWindows<W extends MySpendWindow>({
  windows,
  actions,
}: {
  windows: readonly W[];
  actions?: (window: W, per: string) => ReactNode;
}) {
  const t = useT();
  const [lang] = useLang();
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
  const percentFormat = new Intl.NumberFormat(lang, { style: "percent" });
  return (
    <ul className={styles.list}>
      {windows.map((window) => {
        const period = windowText(window.windowMinutes, t, lang);
        const amount = window.amountUsd === undefined ? null : formatUSD(lang, window.amountUsd);
        const per = amount === null ? period : fill(t("limits.per"), { amount, window: period });
        const percent = percentFormat.format(window.spentPercent / 100);
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
                <Meter label={per} value={window.spentPercent} max={100} />
                <p className={styles.numbers}>
                  <span>
                    {amount === null || window.spentUsd === undefined
                      ? fill(t("limits.spentShare"), { percent })
                      : fill(t("limits.spent"), { spent: formatUSD(lang, window.spentUsd), amount, percent })}
                  </span>
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
