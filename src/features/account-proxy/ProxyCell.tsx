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
 * A stored own proxy as its scheme tag and host. In the list, one line that never wraps:
 * it fades the host's tail when it overflows its room; then the line is focusable and,
 * on hover or focus, rises over its neighbours in full. `wrap` (the drawer, which always
 * shows the full value): the host moves under the tag, and breaks inside only when it
 * still does not fit.
 */
export function OwnProxyLine({
  url,
  scheme,
  host,
  hasCredentials,
  wrap = false,
}: {
  url: string;
  scheme: string;
  host: string;
  hasCredentials: boolean;
  wrap?: boolean;
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
    if (wrap || cell === null || line === null || hostText === null) return;
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
  }, [url, wrap]);
  const full = hasCredentials ? `${url}, ${t("proxy.withCredentials")}` : url;
  return (
    <span ref={cellRef} className={styles.cell} data-wrap={wrap || undefined}>
      <span
        ref={lineRef}
        className={styles.line}
        data-overflow={overflow || undefined}
        role={overflow ? "group" : undefined}
        tabIndex={overflow ? 0 : undefined}
        aria-label={overflow ? full : undefined}
      >
        <span className={styles.tag}>{scheme}</span>
        {/* Wrapped, the line breaks after the tag first; the lock stays with the host's end. */}
        {wrap && " "}
        <span ref={hostRef} className={styles.host}>
          <span className={styles.scheme}>{scheme.toLowerCase()}://</span>
          {host}
        </span>
        {wrap && hasCredentials && "\u00a0"}
        {hasCredentials && <LockIcon label={t("proxy.withCredentials")} />}
      </span>
    </span>
  );
}
