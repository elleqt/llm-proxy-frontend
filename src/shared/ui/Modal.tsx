import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading; also the dialog's accessible name. */
  title: ReactNode;
  children: ReactNode;
  /** Buttons at the bottom, e.g. Cancel and the confirming action. */
  footer?: ReactNode;
  /**
   * What receives focus on open. A child with `autoFocus` works too. With
   * neither, the dialog itself is focused. A destructive confirmation passes
   * its Cancel button here, so Enter right after opening destroys nothing.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Where focus goes on close when the element that opened the dialog is
   * gone, e.g. the Revoke button of the row that was just revoked.
   */
  returnFocus?: HTMLElement | RefObject<HTMLElement | null> | null;
  /**
   * Whether a click on the dimmed page closes the dialog (default). Turn off
   * where a stray click would lose something for good, e.g. a secret shown
   * once. Escape and the close button still close.
   */
  closeOnBackdrop?: boolean;
}

/** Body children with this attribute stay live while a modal is open (the toast region). */
export const LIVE_OUTSIDE_MODAL = "data-live-outside-modal";
/** Marks each dialog's backdrop, the <body> child a Modal renders. */
const BACKDROP = "data-modal-backdrop";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Open dialogs, innermost last. Only the innermost one handles keys and focus.
const stack: HTMLElement[] = [];
let overflowBeforeLock = "";
// How many open dialogs keep each page element inert. An element is only
// released when the last of them closes, in whatever order they close.
const inertHolds = new Map<Element, number>();
// Where focus goes when a dialog closes and nothing better is known: the
// opener of the dialog that started the current stack.
let stackOrigin: HTMLElement | null = null;
// Set when a closing dialog finds focus already inside the dialog replacing
// it: that dialog inherits the closing one's return target as its opener.
let handedOver: HTMLElement | null = null;

function isFocusTarget(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element !== document.body && element.isConnected;
}

/**
 * A modal dialog rendered into <body>. While open, everything else on the page
 * is inert and does not scroll; focus starts inside, Tab and Shift+Tab cycle
 * inside, focus that drops to <body> is pulled back, Escape closes from
 * anywhere. On close, focus returns to the opener, or to `returnFocus` when
 * the opener is gone. A portal with an explicit trap rather than
 * <dialog>.showModal(), which jsdom does not implement, so the behaviour stays
 * under test.
 */
export function Modal({ open, ...dialog }: ModalProps) {
  return open ? <ModalDialog {...dialog} /> : null;
}

function ModalDialog({
  onClose,
  title,
  children,
  footer,
  initialFocus,
  returnFocus,
  closeOnBackdrop = true,
}: Omit<ModalProps, "open">) {
  const t = useT();
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read during render, before this commit applies any child's autoFocus. When
  // this dialog replaces another in the same commit, that is the old dialog's
  // control, gone by setup time; the setup then resolves the real opener.
  const [renderOpener] = useState(() => document.activeElement);
  const opener = useRef<HTMLElement | null>(null);
  const latest = useRef({ onClose, initialFocus, returnFocus });
  useLayoutEffect(() => {
    latest.current = { onClose, initialFocus, returnFocus };
  });
  // What had focus inside when the effect was last torn down; only matters
  // when it is set up again for the same opening (StrictMode in development).
  const focusedInside = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = backdropRef.current;
    if (!dialog || !backdrop) return;
    const root = document.documentElement;

    const active = document.activeElement;
    if (!isFocusTarget(opener.current)) {
      opener.current = isFocusTarget(renderOpener)
        ? renderOpener
        : (handedOver ?? (isFocusTarget(active) && !dialog.contains(active) ? active : null));
    }
    handedOver = null;

    stack.push(dialog);
    if (stack.length === 1) {
      overflowBeforeLock = root.style.overflow;
      root.style.overflow = "hidden";
      stackOrigin = opener.current;
    }
    const held = [...document.body.children].filter((element) => {
      if (element === backdrop || element.hasAttribute(LIVE_OUTSIDE_MODAL)) return false;
      // Dialogs mounted in the same commit register right after this one and
      // go above it; do not make them inert.
      if (element.hasAttribute(BACKDROP) && !stack.some((open) => element.contains(open))) return false;
      const holds = inertHolds.get(element);
      if (holds !== undefined) inertHolds.set(element, holds + 1);
      else if (element.hasAttribute("inert")) return false; // inert for reasons of its own
      else {
        inertHolds.set(element, 1);
        element.setAttribute("inert", "");
      }
      return true;
    });

    const resume = focusedInside.current;
    if (resume?.isConnected) resume.focus();
    else if (!dialog.contains(document.activeElement)) (latest.current.initialFocus?.current ?? dialog).focus();

    const isTop = () => stack[stack.length - 1] === dialog;
    const recapture = () => {
      const active = document.activeElement;
      if (isTop() && (active === null || active === document.body)) dialog.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (!(active instanceof Node) || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Focus moved somewhere else on the page (programmatically, by a click).
    const onFocusIn = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !dialog.contains(event.target)) dialog.focus();
    };
    // Focus left for nowhere: blurred, or the focused control was removed
    // (a busy button replaced by its result). Browsers then focus <body>.
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget === null) setTimeout(recapture);
    };
    const removals = new MutationObserver(recapture);
    removals.observe(dialog, { childList: true, subtree: true });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    dialog.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      dialog.removeEventListener("focusout", onFocusOut);
      removals.disconnect();

      const active = document.activeElement;
      focusedInside.current = active instanceof HTMLElement && dialog.contains(active) ? active : null;
      for (const element of held) {
        const holds = (inertHolds.get(element) ?? 1) - 1;
        if (holds > 0) inertHolds.set(element, holds);
        else {
          inertHolds.delete(element);
          element.removeAttribute("inert");
        }
      }
      const wasTop = isTop();
      stack.splice(stack.indexOf(dialog), 1);
      if (stack.length === 0) root.style.overflow = overflowBeforeLock;
      // A dialog below closing first leaves focus with the one above.
      if (!wasTop) return;

      const fallback = latest.current.returnFocus;
      const target = [opener.current, fallback instanceof HTMLElement ? fallback : fallback?.current, stackOrigin].find(
        isFocusTarget,
      );
      // A dialog that replaces this one in the same commit may already hold
      // focus (autoFocus); leave it there and pass the target on.
      if (active instanceof Element && active.closest("[aria-modal='true']")) {
        handedOver = target ?? null;
        return;
      }
      // Focus can only land once the page is no longer inert.
      target?.focus();
      if (document.activeElement === document.body) stack[stack.length - 1]?.focus();
      if (stack.length === 0) stackOrigin = null;
    };
    // Set up once per opening; the latest props are read through `latest`.
  }, [renderOpener]);

  return createPortal(
    <div
      ref={backdropRef}
      data-modal-backdrop=""
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label={t("ui.close")} onClick={onClose}>
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer != null && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
