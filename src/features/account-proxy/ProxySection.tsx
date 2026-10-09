import { useId, useRef } from "react";
import { useT } from "../../shared/i18n";
import { Button, LockIcon, TextField } from "../../shared/ui";
import { OwnProxyLine } from "./ProxyCell";
import { PROXY_MODES, proxyDraft, proxyParts, type AccountProxy, type ProxyDraft } from "./proxy";
import styles from "./ProxySection.module.css";

/** The proxy part of a drawer. `replacing`: the URL field stands in for a stored own proxy's line. */
export interface ProxySectionDraft extends ProxyDraft {
  replacing: boolean;
}

/** A section's starting point: the stored mode, a stored own proxy shown as its line. */
export function sectionDraft(stored: AccountProxy | undefined): ProxySectionDraft {
  return { ...proxyDraft(stored), replacing: false };
}

/**
 * How an account's traffic leaves the gateway: three segments, and for an own
 * proxy either the stored one's line (kept while it shows) or the URL field.
 */
export function ProxySection({
  value,
  onChange,
  stored,
  error,
}: {
  value: ProxySectionDraft;
  onChange: (next: ProxySectionDraft) => void;
  stored?: AccountProxy | undefined;
  error?: string | undefined;
}) {
  const t = useT();
  const headingId = useId();
  const name = useId();
  const storedOwn = stored?.mode === "custom";
  // Cancel in Replace hands focus back to the Replace button it brings back.
  const refocusReplace = useRef(false);
  const parts = stored?.url === undefined ? null : proxyParts(stored.url);
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.heading}>
        {t("proxy.column")}
      </h3>
      <div role="radiogroup" aria-label={t("proxy.mode")} className={styles.segments}>
        {PROXY_MODES.map((mode) => (
          <label key={mode} className={styles.segment}>
            <input
              type="radio"
              className={styles.visuallyHidden}
              name={name}
              value={mode}
              checked={value.mode === mode}
              onChange={() => onChange({ ...value, mode })}
            />
            <span>{t(mode === "custom" ? "proxy.ownSegment" : `proxy.${mode}`)}</span>
          </label>
        ))}
      </div>
      {value.mode === "inherit" && <p className={styles.hint}>{t("proxy.inheritHint")}</p>}
      {value.mode === "direct" && <p className={styles.hint}>{t("proxy.directHint")}</p>}
      {value.mode === "custom" &&
        (storedOwn && !value.replacing ? (
          <div className={styles.stored}>
            {parts === null || stored.url === undefined ? (
              <>
                <span>{stored.url ?? t("proxy.unreadable")}</span>
                {stored.hasCredentials === true && <LockIcon label={t("proxy.withCredentials")} />}
              </>
            ) : (
              // The list's line: one line, its tail faded when it does not fit, in full on hover or focus.
              <span className={styles.line}>
                <OwnProxyLine
                  url={stored.url}
                  scheme={parts.scheme}
                  host={parts.host}
                  hasCredentials={stored.hasCredentials === true}
                />
              </span>
            )}
            <Button
              ref={(button) => {
                if (button !== null && refocusReplace.current) {
                  refocusReplace.current = false;
                  button.focus();
                }
              }}
              onClick={() => onChange({ ...value, replacing: true })}
            >
              {t("proxy.replace")}
            </Button>
          </div>
        ) : (
          <div className={styles.replace}>
            <TextField
              label={t("proxy.url")}
              hint={t("proxy.urlHint")}
              placeholder="http://user:password@proxy.example.com:3128"
              // The URL may carry the proxy's password, as the API key field does.
              type="password"
              value={value.url}
              mono
              autoComplete="off"
              spellCheck={false}
              autoFocus={value.replacing}
              onChange={(event) => onChange({ ...value, url: event.target.value })}
              error={error}
            />
            {storedOwn && (
              <Button
                onClick={() => {
                  refocusReplace.current = true;
                  onChange({ ...value, replacing: false, url: "" });
                }}
              >
                {t("proxy.cancelReplace")}
              </Button>
            )}
          </div>
        ))}
    </section>
  );
}
