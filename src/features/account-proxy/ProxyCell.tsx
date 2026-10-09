import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../shared/i18n";
import { LockIcon } from "../../shared/ui";
import { proxyParts, type AccountProxy } from "./proxy";
import styles from "./ProxyCell.module.css";

/** An account's proxy in the list: a muted mode, or an own proxy as one line that never wraps. */
export function ProxyCell({ proxy }: { proxy: AccountProxy }) {
  const t = useT();
  if (proxy.mode !== "custom") return <span className={styles.dim}>{t(`proxy.${proxy.mode}`)}</span>;
  if (proxy.url === undefined) return <span>{t("proxy.unreadable")}</span>;
  const parts = proxyParts(proxy.url);
  if (parts === null) return <span>{proxy.url}</span>;
  return <OwnProxyLine url={proxy.url} scheme={parts.scheme} host={parts.host} hasCredentials={proxy.hasCredentials === true} />;
}

/**
 * A stored own proxy as one line that never wraps, in the list and in the drawer.
 * Fades the host's tail when it overflows its room; then the line is focusable
 * and, on hover or focus, rises over its neighbours in full.
 */
export function OwnProxyLine({
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
  const cellRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const cell = cellRef.current;
    const line = lineRef.current;
    const hostText = hostRef.current;
    if (cell === null || line === null || hostText === null) return;
    // The line's natural width (tag, the host unclipped, lock) against the cell's room.
    // The cell keeps its size while the line is raised, so this answer does not flip on hover.
    const check = () =>
      setOverflow(line.scrollWidth - hostText.clientWidth + hostText.scrollWidth > cell.clientWidth);
    check();
    // jsdom has no ResizeObserver.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [url]);
  const full = hasCredentials ? `${url}, ${t("proxy.withCredentials")}` : url;
  return (
    <span ref={cellRef} className={styles.cell}>
      <span
        ref={lineRef}
        className={styles.line}
        data-overflow={overflow || undefined}
        role={overflow ? "group" : undefined}
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
    </span>
  );
}
