import type { ComponentProps, MouseEvent } from "react";
import styles from "./Button.module.css";
import { Spinner } from "./Spinner";

export interface ButtonProps extends ComponentProps<"button"> {
  /**
   * `primary`: the one safe forward action of a view. `danger`: destroys
   * something (revoke, block, delete) — marked by weight and a glyph rather
   * than colour, since the palette has no red. Never make a destructive action
   * `primary`. Its confirmation dialog passes Cancel as the Modal's
   * `initialFocus`, and the confirm button repeats verb and object
   * ("Revoke key", "Block Alice"), never "OK".
   */
  variant?: "primary" | "secondary" | "danger";
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
      {busy ? <Spinner /> : variant === "danger" && <span aria-hidden="true">⚠</span>}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends ComponentProps<"a"> {
  href: string;
  variant?: "primary" | "secondary";
}

/**
 * A navigation that looks like a button: leaving the application (a full-page
 * redirect such as sign-in with the identity provider) is a link, not a form,
 * so the CSP's `form-action 'self'` never sees the cross-origin redirect.
 */
export function ButtonLink({ variant = "secondary", className, children, ...rest }: ButtonLinkProps) {
  return (
    <a {...rest} className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}>
      {children}
    </a>
  );
}
