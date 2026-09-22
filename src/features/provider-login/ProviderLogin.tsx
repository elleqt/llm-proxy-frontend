import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  accountName,
  LOGIN_PROVIDERS,
  providerAccountsQuery,
  type LoginProvider,
  type ProviderAccount,
} from "../../entities/provider/providers";
import { ApiError, client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
import { useErrorMessage, useLang, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, CopyField, Modal, Select, TextField } from "../../shared/ui";
import styles from "./ProviderLogin.module.css";

type LoginSession = components["schemas"]["ProviderLoginSession"];

/** The "Add account" button and its three-step wizard. */
export function AddProviderAccount() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("providerLogin.open")}
      </Button>
      {/* Mounted only while open: closing drops the sign-in link with the wizard's state. */}
      {open && <Wizard onClose={() => setOpen(false)} />}
    </>
  );
}

/** Milliseconds left until `expiresAt`, ticking every second; never negative. */
function useRemaining(expiresAt: string | undefined): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (expiresAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt === undefined ? 0 : Math.max(0, Date.parse(expiresAt) - now);
}

function Wizard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<LoginProvider>(LOGIN_PROVIDERS[0]);
  const [session, setSession] = useState<LoginSession | null>(null);
  const [step, setStep] = useState<"link" | "callback">("link");
  const [callbackURL, setCallbackURL] = useState("");
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [refusedAsExpired, setRefusedAsExpired] = useState(false);
  const [added, setAdded] = useState<ProviderAccount | null>(null);

  const remaining = useRemaining(session?.expiresAt);
  const expired = session !== null && (remaining === 0 || refusedAsExpired);

  const start = useMutation({
    mutationFn: (body: { provider: LoginProvider }) =>
      unwrap(client.POST("/api/admin/providers/login/start", { body })),
    onSuccess: (created) => {
      setSession(created);
      setStep("link");
      setCallbackURL("");
      setRefusedAsExpired(false);
    },
  });
  const complete = useMutation({
    mutationFn: (body: { sessionId: string; callbackURL: string }) =>
      unwrap(client.POST("/api/admin/providers/login/complete", { body })),
    onSuccess: (account) => {
      setAdded(account);
      void queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "login_expired") setRefusedAsExpired(true);
    },
  });

  const restart = () => {
    setSession(null);
    start.reset();
    complete.reset();
  };

  const submitCallback = (event: FormEvent) => {
    event.preventDefault();
    if (session === null || expired) return;
    const url = callbackURL.trim();
    if (url === "") {
      setCallbackError(t("providerLogin.callbackRequired"));
      return;
    }
    setCallbackError(null);
    complete.mutate({ sessionId: session.sessionId, callbackURL: url });
  };

  if (added !== null) {
    return (
      <Modal
        key="added"
        open
        onClose={onClose}
        title={t("providerLogin.addedTitle")}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t("providerLogin.done")}
          </Button>
        }
      >
        <p>{fill(t("providerLogin.added"), { name: accountName(added), provider: added.provider })}</p>
      </Modal>
    );
  }

  const time = new Intl.DateTimeFormat(lang, { timeStyle: "short" });
  const seconds = Math.ceil(remaining / 1000);
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const stepNumber = session === null ? 1 : step === "link" ? 2 : 3;

  return (
    <Modal
      open
      // The sign-in link is as good as a secret until it expires: no closing by a stray click.
      closeOnBackdrop={false}
      onClose={onClose}
      title={t("providerLogin.title")}
    >
      <p className={styles.step}>{fill(t("providerLogin.step"), { n: stepNumber, of: 3 })}</p>

      {session === null ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate({ provider });
          }}
        >
          <Select
            label={t("providerLogin.provider")}
            value={provider}
            autoFocus
            options={LOGIN_PROVIDERS.map((value) => ({ value, label: value }))}
            onChange={(event) => setProvider(event.target.value as LoginProvider)}
          />
          {start.isError && <p role="alert">{errorMessage(start.error)}</p>}
          <div className={styles.actions}>
            <Button onClick={onClose}>{t("ui.cancel")}</Button>
            <Button type="submit" variant="primary" busy={start.isPending}>
              {t("providerLogin.getLink")}
            </Button>
          </div>
        </form>
      ) : expired ? (
        <div className={styles.form}>
          <p role="alert">{fill(t("providerLogin.expired"), { time: time.format(new Date(session.expiresAt)) })}</p>
          <div className={styles.actions}>
            <Button onClick={onClose}>{t("ui.cancel")}</Button>
            <Button variant="primary" autoFocus onClick={restart}>
              {t("providerLogin.restart")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p role="timer" aria-live="off" className={styles.countdown}>
            {fill(t("providerLogin.expiresIn"), { countdown })}
          </p>
          {step === "link" ? (
            <div className={styles.form}>
              <p>{t("providerLogin.openLink")}</p>
              <CopyField label={fill(t("providerLogin.link"), { provider })} value={session.authURL} />
              <div className={styles.actions}>
                <Button onClick={onClose}>{t("ui.cancel")}</Button>
                <Button variant="primary" onClick={() => setStep("callback")}>
                  {t("providerLogin.next")}
                </Button>
              </div>
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitCallback} noValidate>
              <TextField
                label={t("providerLogin.callback")}
                hint={t("providerLogin.callbackHint")}
                value={callbackURL}
                mono
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setCallbackURL(event.target.value)}
                error={callbackError ?? undefined}
              />
              {complete.isError && <p role="alert">{errorMessage(complete.error)}</p>}
              <div className={styles.actions}>
                <Button onClick={() => setStep("link")}>{t("providerLogin.back")}</Button>
                <Button type="submit" variant="primary" busy={complete.isPending}>
                  {t("providerLogin.complete")}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
