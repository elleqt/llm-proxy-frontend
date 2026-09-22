import type { ButtonHTMLAttributes, MouseEvent } from "react";
import styles from "./Button.module.css";
import { Spinner } from "./Spinner";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  /**
   * A long action is running. The button stays focusable (a disabled button
   * would drop focus mid-action) but ignores clicks and does not submit.
   */
  busy?: boolean;
}

export function Button({
  variant = "secondary",
  busy = false,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest["aria-disabled"]}
      onClick={handleClick}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}
