import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
}

/** A native checkbox wrapped in its label, so the whole label is the hit area. */
export function Checkbox({ label, className, ...input }: CheckboxProps) {
  return (
    <label className={[styles.checkbox, className].filter(Boolean).join(" ")}>
      <input {...input} type="checkbox" className={styles.input} />
      <span>{label}</span>
    </label>
  );
}
