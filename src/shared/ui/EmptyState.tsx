import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  /** The next step, e.g. a button that creates the first item. */
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {body != null && <p className={styles.body}>{body}</p>}
      {action != null && <div className={styles.action}>{action}</div>}
    </div>
  );
}
