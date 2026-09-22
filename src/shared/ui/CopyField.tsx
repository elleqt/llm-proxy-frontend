import { useEffect, useId, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import styles from "./CopyField.module.css";

export interface CopyFieldProps {
  label: ReactNode;
  /** The secret: a new token, a temporary password, a vendor sign-in link. */
  value: string;
}

const CONFIRMATION_MS = 2000;

/**
 * Shows a secret once. The value lives only in the caller's props: nothing is
 * cached, stored or put in the address, so it is gone when this unmounts.
 */
export function CopyField({ label, value }: CopyFieldProps) {
  const t = useT();
  const labelId = useId();
  const warningId = useId();
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
    }
  };

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={warningId} className={styles.field}>
      <div id={labelId} className={styles.label}>
        {label}
      </div>
      <div className={styles.row}>
        <code className={styles.value}>{value}</code>
        <button type="button" className={styles.copy} onClick={() => void copy()}>
          {status === "copied" ? t("ui.copied") : t("ui.copy")}
        </button>
      </div>
      <p id={warningId} className={styles.warning}>
        {t("ui.shownOnce")}
      </p>
      <p role="status" className={status === "failed" ? styles.failed : styles.visuallyHidden}>
        {status === "copied" ? t("ui.copied") : status === "failed" ? t("ui.copyFailed") : ""}
      </p>
    </div>
  );
}
