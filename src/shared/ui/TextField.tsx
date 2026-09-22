import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./TextField.module.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: ReactNode;
  /** Guidance shown before the user submits, e.g. password requirements. */
  hint?: ReactNode;
  /** Already-translated error text; marks the field invalid. */
  error?: ReactNode;
  /** Monospace value: tokens, model ids. */
  mono?: boolean;
}

export function TextField({ label, hint, error, mono = false, className, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint != null && hintId, error != null && errorId].filter(Boolean).join(" ");
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className={mono ? `${styles.input} ${styles.mono}` : styles.input}
        aria-invalid={error != null || undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint != null && (
        <div id={hintId} className={styles.hint}>
          {hint}
        </div>
      )}
      {error != null && (
        <div id={errorId} className={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
}
