import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { rememberFreshToken, tokensQuery, type FreshToken } from "../../entities/token/tokens";
import { ApiError, client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, CopyField, Modal, TextField } from "../../shared/ui";
import styles from "./IssueToken.module.css";

/** The "Issue a key" button and its dialog. */
export function IssueToken() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("issue.open")}
      </Button>
      {/* Mounted only while open: closing drops the secret with the dialog's state. */}
      {open && <IssueTokenDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function IssueTokenDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [issued, setIssued] = useState<FreshToken | null>(null);

  const issue = useMutation({
    mutationFn: (body: { label: string }) => unwrap(client.POST("/api/me/tokens", { body })),
    onSuccess: ({ token, secret }) => {
      const fresh = { id: token.id, label: token.label, secret };
      rememberFreshToken(queryClient, fresh);
      setIssued(fresh);
      void queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (trimmed === "") {
      setLabelError(t("issue.labelRequired"));
      return;
    }
    setLabelError(null);
    issue.mutate({ label: trimmed });
  };

  if (issued !== null) {
    return (
      // A new dialog, not the form re-rendered: focus moves into it afresh
      // instead of being lost with the submit button.
      <Modal
        key="issued"
        open
        // A stray click must not throw away a secret that is shown only once.
        closeOnBackdrop={false}
        onClose={onClose}
        title={t("issue.issuedTitle")}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t("issue.done")}
          </Button>
        }
      >
        <CopyField label={fill(t("issue.secretLabel"), { label: issued.label })} value={issued.secret} />
        <p>
          <Link to="/connect">{t("issue.connect")}</Link>
        </p>
      </Modal>
    );
  }

  const fieldError = issue.error instanceof ApiError && issue.error.field === "label" ? errorMessage(issue.error) : null;
  return (
    <Modal open onClose={onClose} title={t("issue.open")}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t("issue.label")}
          hint={t("issue.labelHint")}
          value={label}
          maxLength={80}
          autoComplete="off"
          autoFocus
          onChange={(event) => setLabel(event.target.value)}
          error={labelError ?? fieldError}
        />
        {issue.isError && fieldError === null && <p role="alert">{errorMessage(issue.error)}</p>}
        <div className={styles.actions}>
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" busy={issue.isPending}>
            {t("issue.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
