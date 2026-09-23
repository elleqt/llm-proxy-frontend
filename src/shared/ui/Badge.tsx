import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export interface BadgeProps {
  /** `accent` for an active/positive state, `muted` for an inactive one. */
  tone?: "neutral" | "accent" | "muted";
  children: ReactNode;
}

/** A short state label. The text carries the meaning; colour only reinforces it. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
