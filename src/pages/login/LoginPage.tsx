import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authConfigQuery, OIDC_START_PATH } from "../../entities/session/authConfig";
import { startSession } from "../../features/session/session";
import { ApiError, client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
import { useErrorMessage, useLang, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, ButtonLink, Spinner, TextField } from "../../shared/ui";
import styles from "./LoginPage.module.css";

/** The refusals the identity-provider callback sends back as `/login?error=<code>`. */
const OIDC_ERRORS = ["oidc_forbidden", "oidc_failed"] as const;

/** 429 `locked_out`, with the moment the next attempt is accepted when the server said. */
class LockedOutError extends ApiError {
  readonly retryAt: Date | null;
  constructor(status: number, retryAfter: string | null) {
    super(status, "locked_out");
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    this.retryAt = Number.isFinite(seconds) && seconds >= 0 ? new Date(Date.now() + seconds * 1000) : null;
  }
}

async function signIn(body: components["schemas"]["LoginRequest"]) {
  const call = client.POST("/api/auth/login", { body });
  try {
    return await unwrap(call);
  } catch (error) {
    if (error instanceof ApiError && error.code === "locked_out") {
      const { response } = await call;
      throw new LockedOutError(error.status, response.headers.get("Retry-After"));
    }
    throw error;
  }
}

export function LoginPage() {
  const t = useT();
  const config = useQuery(authConfigQuery);
  const errorMessage = useErrorMessage();
  const [params] = useSearchParams();
  const oidcError = OIDC_ERRORS.find((code) => code === params.get("error"));

  return (
    <>
      <h1>{t("page.login.title")}</h1>
      {oidcError !== undefined && <p role="alert">{t(`error.${oidcError}`)}</p>}
      {config.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : config.isError ? (
        <p role="alert">{errorMessage(config.error)}</p>
      ) : (
        <div className={styles.options}>
          {config.data.localLogin && <LoginForm />}
          {config.data.localLogin && config.data.oidc.enabled && <p className={styles.or}>{t("login.or")}</p>}
          {config.data.oidc.enabled && (
            // A link, not a form: the identity provider takes over the whole page,
            // and CSP `form-action 'self'` would block a form's redirect to it.
            <ButtonLink href={OIDC_START_PATH} variant={config.data.localLogin ? "secondary" : "primary"}>
              {config.data.oidc.displayName
                ? fill(t("login.oidc"), { name: config.data.oidc.displayName })
                : t("login.oidcGeneric")}
            </ButtonLink>
          )}
          {!config.data.localLogin && !config.data.oidc.enabled && <p>{t("login.unavailable")}</p>}
        </div>
      )}
    </>
  );
}

function LoginForm() {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: signIn,
    onSuccess: (me) => {
      startSession(queryClient, me);
      void navigate(me.restricted ? "/password" : "/", { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  let failure: string | null = null;
  if (login.error instanceof LockedOutError && login.error.retryAt !== null) {
    // Rounded up to the minute: "after 14:06" must not be a moment the lock still holds.
    const retryAt = new Date(Math.ceil(login.error.retryAt.getTime() / 60_000) * 60_000);
    const time = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(retryAt);
    failure = fill(t("login.lockedOutUntil"), { time });
  } else if (login.isError) {
    failure = errorMessage(login.error);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <TextField
        label={t("login.email")}
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        label={t("login.password")}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {failure !== null && <p role="alert">{failure}</p>}
      <div>
        <Button type="submit" variant="primary" busy={login.isPending}>
          {t("login.submit")}
        </Button>
      </div>
    </form>
  );
}
