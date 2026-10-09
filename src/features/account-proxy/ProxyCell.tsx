import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../shared/i18n";
import { LockIcon } from "../../shared/ui";
import { proxyParts, type AccountProxy } from "./proxy";
import styles from "./ProxyCell.module.css";

/** An account's proxy in the list: a muted mode, or an own proxy as one line that never wraps. */
export function ProxyCell({ proxy }: { proxy: AccountProxy }) {
  const t = useT();
  if (proxy.mode !== "custom") return <span className={styles.dim}>{t(`proxy.${proxy.mode}`)}</span>;
  const parts = proxy.url === undefined ? null : proxyParts(proxy.url);
  if (parts === null) return <span>{proxy.url ?? t("proxy.unreadable")}</span>;
  return (
    <span className={styles.cell}>
      <OwnProxyLine url={proxy.url!} scheme={parts.scheme} host={parts.host} hasCredentials={proxy.hasCredentials === true} />
    </span>
  );
}

/**
 * Fades the host's tail when it overflows the column; then the line is
 * focusable and, on hover or focus, rises over its neighbours in full.
 */
function OwnProxyLine({
  url,
  scheme,
  host,
  hasCredentials,
}: {
  url: string;
  scheme: string;
  host: string;
  hasCredentials: boolean;
}) {
  const t = useT();
  const hostRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const element = hostRef.current;
    if (element === null) return;
    const check = () => setOverflow(element.scrollWidth > element.clientWidth);
    check();
    // jsdom has no ResizeObserver.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [url]);
  const full = hasCredentials ? `${url}, ${t("proxy.withCredentials")}` : url;
  return (
    <span
      className={styles.line}
      data-overflow={overflow || undefined}
      tabIndex={overflow ? 0 : undefined}
      aria-label={overflow ? full : undefined}
    >
      <span className={styles.tag}>{scheme}</span>
      <span ref={hostRef} className={styles.host}>
        <span className={styles.scheme}>{scheme.toLowerCase()}://</span>
        {host}
      </span>
      {hasCredentials && <LockIcon label={t("proxy.withCredentials")} />}
    </span>
  );
}
