import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { LIVE_OUTSIDE_MODAL } from "./Modal";
import styles from "./Toast.module.css";

type Notify = (message: string) => void;

interface ToastItem {
  id: number;
  message: string;
}

const ToastContext = createContext<Notify | null>(null);

export const TOAST_TIMEOUT_MS = 5000;

/**
 * Owns the live region. It is rendered from the start and stays mounted:
 * screen readers announce changes to a region they already know about, not
 * a region that appears together with its text. It sits directly in <body>
 * and stays live while a Modal makes the rest of the page inert, so a
 * message sent as a dialog closes is still announced.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback<Notify>((message) => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, message }]);
  }, []);

  return (
    <ToastContext value={notify}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label={t("ui.notifications")}
          className={styles.region}
          {...{ [LIVE_OUTSIDE_MODAL]: "" }}
        >
          <ul aria-live="polite" aria-relevant="additions text" className={styles.list}>
            {items.map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismiss} dismissLabel={t("ui.dismiss")} />
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </ToastContext>
  );
}

function Toast({
  item,
  onDismiss,
  dismissLabel,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
  dismissLabel: string;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <li className={styles.toast}>
      <span className={styles.message}>{item.message}</span>
      <button type="button" className={styles.dismiss} aria-label={dismissLabel} onClick={() => onDismiss(item.id)}>
        ×
      </button>
    </li>
  );
}

/** `const notify = useToast(); notify(t("…"))` — the message is already translated. */
export function useToast(): Notify {
  const notify = use(ToastContext);
  if (notify === null) throw new Error("useToast outside ToastProvider");
  return notify;
}
