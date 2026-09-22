import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type MouseEvent } from "react";
import { Link } from "react-router";
import { handOffFreshToken, tokensQuery, type FreshToken } from "../../entities/token/tokens";
import { ApiError, client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
import { useErrorMessage, useT, type MessageKey } from "../../shared/i18n";
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
  // A key, not text: it is translated at render, so it follows a language switch.
  const [labelError, setLabelError] = useState<MessageKey | null>(null);
  const [issued, setIssued] = useState<FreshToken | null>(null);

  const issue = useMutation({
    mutationFn: (body: components["schemas"]["IssueTokenRequest"]) => unwrap(client.POST("/api/me/tokens", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey }),
    // With reset() below, the response leaves the mutation cache at once.
    gcTime: 0,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (trimmed === "") {
      setLabelError("issue.labelRequired");
      return;
    }
    setLabelError(null);
    issue.mutate(
      { label: trimmed },
      {
        // The secret moves into this dialog's state and nowhere else.
        onSuccess: ({ token, secret }) => {
          setIssued({ id: token.id, label: token.label, secret });
          issue.reset();
        },
      },
    );
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
          <Link to="/connect" onClick={(event) => handOff(event, issued)}>
            {t("issue.connect")}
          </Link>
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
          error={labelError !== null ? t(labelError) : fieldError}
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

/**
 * Hands the key to /connect when this click navigates there in this tab. A
 * modified click opens another tab, which could not take it, so nothing is left behind.
 */
function handOff(event: MouseEvent, token: FreshToken): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  handOffFreshToken(token);
}
