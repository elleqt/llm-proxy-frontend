import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> {
  label: ReactNode;
  options: readonly SelectOption[];
  hint?: ReactNode;
}

/** A native <select>: the platform already gets keyboard and screen readers right. */
export function Select({ label, options, hint, className, ...select }: SelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select {...select} id={id} className={styles.select} aria-describedby={hint != null ? hintId : undefined}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint != null && (
        <div id={hintId} className={styles.hint}>
          {hint}
        </div>
      )}
    </div>
  );
}
