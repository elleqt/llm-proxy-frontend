import type { components } from "../../shared/api/schema";
import { useLang, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import styles from "./QuotaMeters.module.css";
import { quotaReset } from "./quotaReset";

type QuotaWindow = components["schemas"]["ProviderAccount"]["quota"][number];

/** An account's quota windows as meters: used share and when each resets, counted from `now`. */
export function QuotaMeters({ quota, now }: { quota: readonly QuotaWindow[]; now: number }) {
  const t = useT();
  const [lang] = useLang();
  if (quota.length === 0) return <span className={styles.dim}>{t("providers.noQuota")}</span>;
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const percent = new Intl.NumberFormat(lang, { style: "percent" });
  return (
    <ul className={styles.quotas}>
      {quota.map((window) => {
        const used = percent.format(window.usedRatio);
        return (
          <li key={window.window} className={styles.quota}>
            <span className={styles.quotaWindow}>{window.window}</span>
            <span
              role="meter"
              aria-label={fill(t("providers.quotaLabel"), { window: window.window })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(window.usedRatio * 100)}
              aria-valuetext={used}
              className={styles.bar}
            >
              <span
                className={styles.barFill}
                style={{ width: `${Math.min(1, Math.max(0, window.usedRatio)) * 100}%` }}
              />
            </span>
            <span
              className={styles.quotaText}
              title={window.resetAt == null ? undefined : dateTime.format(new Date(window.resetAt))}
            >
              {used}
              {window.resetAt != null && ` · ${quotaReset(window.resetAt, now, lang, t)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
