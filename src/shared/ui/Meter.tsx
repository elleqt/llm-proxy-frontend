import styles from "./Meter.module.css";

export interface MeterProps {
  /** Accessible name; the visible numbers are the caller's. */
  label: string;
  value: number;
  max: number;
}

/** How much of a budget is used: a native <meter>, which assistive technology reads. */
export function Meter({ label, value, max }: MeterProps) {
  return <meter className={styles.meter} aria-label={label} min={0} max={max} value={Math.min(value, max)} />;
}
