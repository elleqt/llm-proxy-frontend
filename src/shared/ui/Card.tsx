import { useId, type ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps {
  /** Heading of the card; when present the card is a labelled region. */
  title?: ReactNode;
  /** Controls placed on the heading line, e.g. an "Issue" button. */
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, actions, children }: CardProps) {
  const titleId = useId();
  if (title == null) {
    return <div className={styles.card}>{children}</div>;
  }
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {actions != null && <div className={styles.actions}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}
