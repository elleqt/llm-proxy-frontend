import type { ComponentProps, ReactNode } from "react";
import styles from "./Icon.module.css";

interface IconProps {
  /** Gives the icon a name of its own; without it the icon is decorative. */
  label?: string | undefined;
}

function Svg({ label, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
    >
      {label !== undefined && <title>{label}</title>}
      {children}
    </svg>
  );
}

export function PencilIcon({ label }: IconProps) {
  return (
    <Svg label={label}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function TrashIcon({ label }: IconProps) {
  return (
    <Svg label={label}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function LockIcon({ label }: IconProps) {
  return (
    <Svg label={label}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function RefreshIcon({ label }: IconProps) {
  return (
    <Svg label={label}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </Svg>
  );
}

export interface IconButtonProps extends ComponentProps<"button"> {
  /** Accessible name and tooltip; the icon itself stays decorative. */
  label: string;
  /** `danger`: a destructive action, the only use of the `--danger` colour. */
  tone?: "neutral" | "danger";
  children: ReactNode;
}

/** A compact button showing only an icon, e.g. a table row's Edit and Delete. */
export function IconButton({ label, tone = "neutral", type = "button", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={[styles.button, tone === "danger" && styles.danger, className].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
