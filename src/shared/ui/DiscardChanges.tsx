import { useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { Button } from "./Button";
import { Modal } from "./Modal";

/**
 * Guards closing a form with unsaved edits. Pass `requestClose` as the form
 * dialog's `onClose` (Escape, ×, backdrop, Cancel) and render `dialog` inside
 * it: a clean form closes at once, a dirty one asks first, with Keep editing
 * focused so Enter loses nothing.
 */
export function useDiscardGuard(dirty: boolean, close: () => void): { requestClose: () => void; dialog: ReactNode } {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const requestClose = () => (dirty ? setAsking(true) : close());
  const dialog = asking && (
    <Modal
      open
      onClose={() => setAsking(false)}
      title={t("ui.discardTitle")}
      initialFocus={keepRef}
      footer={
        <>
          <Button ref={keepRef} onClick={() => setAsking(false)}>
            {t("ui.keepEditing")}
          </Button>
          <Button variant="danger" onClick={close}>
            {t("ui.discard")}
          </Button>
        </>
      }
    >
      <p>{t("ui.discardBody")}</p>
    </Modal>
  );
  return { requestClose, dialog };
}
