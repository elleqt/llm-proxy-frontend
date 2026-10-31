import { useRef } from "react";
import { useT } from "../../shared/i18n";
import { Button, TextField } from "../../shared/ui";
import type { HeadersDraft } from "./headers";
import styles from "./CompatHeaders.module.css";

/** Values are write-only: replacing starts a new full map, never masked old values. */
export function CompatHeaders({ draft, names, onChange, error }: {
  draft: HeadersDraft;
  names: readonly string[];
  onChange: (draft: HeadersDraft) => void;
  error?: string | undefined;
}) {
  const t = useT();
  const nextId = useRef(0);
  const focusReplace = useRef(false);
  const replaceRef = (button: HTMLButtonElement | null) => {
    if (button !== null && focusReplace.current) {
      focusReplace.current = false;
      button.focus();
    }
  };
  const keep = () => {
    focusReplace.current = true;
    onChange({ mode: "keep" });
  };
  const replace = () => onChange({ mode: "replace", rows: [{ id: nextId.current++, name: "", value: "" }] });
  return (
    <fieldset className={styles.section}>
      <legend>{t("compat.headers")}</legend>
      <p className={styles.hint}>{t("compat.headersHint")}</p>
      {draft.mode === "replace" ? (
        <>
          {draft.rows.map((row, index) => (
            <div className={styles.row} key={row.id}>
              <TextField label={`${t("compat.headerName")} ${index + 1}`} value={row.name} mono autoComplete="off" spellCheck={false}
                onChange={(event) => onChange({ mode: "replace", rows: draft.rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item) })} />
              <TextField label={`${t("compat.headerValue")} ${index + 1}`} value={row.value} type="password" autoComplete="off" spellCheck={false}
                onChange={(event) => onChange({ mode: "replace", rows: draft.rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item) })} />
              <Button aria-label={`${t("compat.headerRemove")} ${index + 1}`} onClick={() => onChange({ mode: "replace", rows: draft.rows.filter((item) => item.id !== row.id) })}>{t("compat.headerRemove")}</Button>
            </div>
          ))}
          <div className={styles.actions}>
            <Button onClick={() => onChange({ mode: "replace", rows: [...draft.rows, { id: nextId.current++, name: "", value: "" }] })}>{t("compat.headerAdd")}</Button>
            <Button onClick={keep}>{t("compat.headersCancel")}</Button>
          </div>
        </>
      ) : draft.mode === "clear" ? (
        <div className={styles.actions}>
          <span>{t("compat.headersCleared")}</span>
          <Button onClick={keep}>{t("compat.headersUndo")}</Button>
        </div>
      ) : (
        <>
          <p className={styles.names}>{names.length > 0 ? names.join(", ") : t("compat.headersEmpty")}</p>
          {names.length > 0 && <p className={styles.hint}>{t("compat.headersStored")}</p>}
          <div className={styles.actions}>
            <Button ref={replaceRef} onClick={replace}>{t(names.length > 0 ? "compat.headersReplace" : "compat.headersAdd")}</Button>
            {names.length > 0 && <Button onClick={() => onChange({ mode: "clear" })}>{t("compat.headersRemove")}</Button>}
          </div>
        </>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </fieldset>
  );
}
