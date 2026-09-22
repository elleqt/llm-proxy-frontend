import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, Modal, TextField } from "../../shared/ui";
import styles from "./admin.module.css";

interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  /**
   * For an irreversible, high-impact action: what must be typed, exactly,
   * before the action is offered.
   */
  typeToConfirm?: string | undefined;
  /** Verb and object, e.g. "Remove account", never "OK". */
  confirmLabel: string;
  /** `danger` (default) destroys something; `primary` for the safe way back, e.g. unblocking. */
  variant?: "danger" | "primary";
  busy: boolean;
  /** Already-translated failure of the action, shown in place. */
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}

/**
 * A confirmation naming its object, opening on Cancel. With `typeToConfirm`
 * the action works only once that name is typed.
 */
export function ConfirmDialog({
  title,
  body,
  typeToConfirm,
  confirmLabel,
  variant = "danger",
  busy,
  error,
  onConfirm,
  onClose,
  returnFocus,
}: ConfirmDialogProps) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const matches = typeToConfirm === undefined || typed === typeToConfirm;
  return (
    <Modal
      open
      onClose={onClose}
      initialFocus={cancelRef}
      returnFocus={returnFocus ?? null}
      title={title}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose}>
            {t("ui.cancel")}
          </Button>
          <Button variant={variant} busy={busy} disabled={!matches} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {body}
        {typeToConfirm !== undefined && (
          <TextField
            label={fill(t("admin.typeToConfirm"), { name: typeToConfirm })}
            value={typed}
            mono
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches && !busy) onConfirm();
            }}
          />
        )}
        {error !== null && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
