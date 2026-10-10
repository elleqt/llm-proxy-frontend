import type { ReactNode } from "react";
import styles from "./Toggle.module.css";

export interface ToggleProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Keep the label for assistive technology only, e.g. in a table row whose name already shows. */
  hideLabel?: boolean;
}

/**
 * An on/off switch. A <button> gives Space and Enter activation for free;
 * `role="switch"` + `aria-checked` tells assistive technology the state.
 */
export function Toggle({ label, checked, onChange, disabled = false, hideLabel = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={hideLabel ? styles.hidden : undefined}>{label}</span>
    </button>
  );
}
