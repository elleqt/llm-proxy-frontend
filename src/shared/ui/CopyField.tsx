import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import styles from "./CopyField.module.css";

export interface CopyFieldProps {
  label: ReactNode;
  /** The secret: a new token, a temporary password, a vendor sign-in link. */
  value: string;
  /**
   * Why the value must be taken now; the field's accessible description.
   * Defaults to "it will not be shown again". A vendor sign-in link passes
   * its own, e.g. that it expires with the countdown.
   */
  warning?: ReactNode;
}

const CONFIRMATION_MS = 2000;

/**
 * Shows a secret once. The value lives only in the caller's props: nothing is
 * cached, stored or put in the address, so it is gone when this unmounts.
 *
 * The value is a read-only, focusable text box that selects itself on focus,
 * so copying by hand works from the keyboard too. When the clipboard API
 * fails (permission denied, or an insecure context without one), focus moves
 * to the value with it selected and the user is told to copy it.
 */
export function CopyField({ label, value, warning }: CopyFieldProps) {
  const t = useT();
  const labelId = useId();
  const warningId = useId();
  const valueRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
      valueRef.current?.focus();
    }
  };

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={warningId} className={styles.field}>
      <div id={labelId} className={styles.label}>
        {label}
      </div>
      <div className={styles.row}>
        <code
          ref={valueRef}
          role="textbox"
          aria-readonly="true"
          aria-labelledby={labelId}
          tabIndex={0}
          className={styles.value}
          onFocus={(event) => document.getSelection()?.selectAllChildren(event.currentTarget)}
        >
          {value}
        </code>
        <button type="button" className={styles.copy} onClick={() => void copy()}>
          {status === "copied" ? t("ui.copied") : t("ui.copy")}
        </button>
      </div>
      <p id={warningId} className={styles.warning}>
        {warning ?? t("ui.shownOnce")}
      </p>
      <p role="status" className={status === "failed" ? styles.failed : styles.visuallyHidden}>
        {status === "copied" ? t("ui.copied") : status === "failed" ? t("ui.copyFailed") : ""}
      </p>
    </div>
  );
}
