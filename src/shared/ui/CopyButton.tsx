import { useEffect, useState } from "react";
import { useT } from "../i18n";
import styles from "./CopyButton.module.css";

export interface CopyButtonProps {
  /** The text put on the clipboard, exactly as given. */
  value: string;
}

const CONFIRMATION_MS = 2000;

/**
 * Copies `value` to the clipboard and says so. When the clipboard API fails
 * (permission denied, or an insecure context without one), it tells the user
 * to copy by hand: the text it copies is shown next to it, selectable.
 */
export function CopyButton({ value }: CopyButtonProps) {
  const t = useT();
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
    <div className={styles.copy}>
      <p role="status" className={status === "failed" ? styles.failed : styles.visuallyHidden}>
        {status === "copied" ? t("ui.copied") : status === "failed" ? t("ui.copyFailedManual") : ""}
      </p>
      <button type="button" className={styles.button} onClick={() => void copy()}>
        {status === "copied" ? t("ui.copied") : t("ui.copy")}
      </button>
    </div>
  );
}
