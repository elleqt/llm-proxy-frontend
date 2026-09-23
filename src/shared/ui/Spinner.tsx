import styles from "./Spinner.module.css";

/**
 * With a `label` the spinner announces itself as a status; without one it is
 * decoration next to text that already says what is happening.
 */
export function Spinner({ label }: { label?: string }) {
  if (label === undefined) return <span className={styles.spinner} aria-hidden="true" />;
  return (
    <span role="status" className={styles.wrap}>
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.visuallyHidden}>{label}</span>
    </span>
  );
}
