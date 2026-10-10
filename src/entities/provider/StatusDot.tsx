import { useLang, useT, type MessageKey } from "../../shared/i18n";
import { shortDateTime } from "../../shared/lib/dates";
import type { ProviderAccount } from "./providers";
import styles from "./StatusDot.module.css";

/** An account's state in words: disabled, the known statuses, or the vendor's own word. */
export function accountStatus(account: ProviderAccount, t: (key: MessageKey) => string): string {
  if (account.disabled) return t("providers.disabled");
  if (account.status === "active") return t("providers.status.active");
  if (account.status === "error") return t("providers.status.error");
  return account.status;
}

/** When a subscription's token was last refreshed, or "never". */
export function refreshedAt(account: ProviderAccount, now: number, lang: string, t: (key: MessageKey) => string): string {
  return account.lastRefreshedAt == null ? t("providers.never") : shortDateTime(Date.parse(account.lastRefreshedAt), now, lang);
}

/**
 * An account's state as a dot: active, error, disabled, or dimmed for a vendor's own word.
 * Decorative: its `title` repeats what the surrounding view says in words, plus, for a
 * subscription, when its token was refreshed.
 */
export function StatusDot({ account, now }: { account: ProviderAccount; now?: number }) {
  const t = useT();
  const [lang] = useLang();
  const status = accountStatus(account, t);
  return (
    <span
      aria-hidden
      className={styles.dot}
      data-status={account.disabled ? "disabled" : account.status}
      title={
        account.compat === undefined
          ? `${status} · ${t("providers.refreshed")}: ${refreshedAt(account, now ?? Date.now(), lang, t)}`
          : status
      }
    />
  );
}
