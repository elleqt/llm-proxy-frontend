import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { meQuery, useMe } from "../../entities/user/me";
import { SignOutButton } from "../../features/session/SignOutButton";
import { ApiError, client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";
import { Button, TextField } from "../../shared/ui";
import styles from "./PasswordPage.module.css";

/** `PasswordChangeRequest.newPassword.minLength` in the contract. */
const MIN_LENGTH = 12;

type Field = "currentPassword" | "newPassword" | "repeat";

export function PasswordPage() {
  const t = useT();
  const errorMessage = useErrorMessage("password");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Below the session guard `me` is loaded.
  const restricted = useMe().data?.restricted ?? false;
  const [values, setValues] = useState<Record<Field, string>>({ currentPassword: "", newPassword: "", repeat: "" });
  const [invalid, setInvalid] = useState<Partial<Record<Field, string>>>({});

  const change = useMutation({
    mutationFn: async () => {
      await unwrap(
        client.POST("/api/auth/password", {
          body: restricted
            ? { newPassword: values.newPassword }
            : { currentPassword: values.currentPassword, newPassword: values.newPassword },
        }),
      );
      // A stale `restricted: true` would send the user straight back here.
      await queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
    },
    onSuccess: () => void navigate("/", { replace: true }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<Field, string>> = {};
    if (values.newPassword.length < MIN_LENGTH) found.newPassword = t("password.tooShort");
    else if (values.repeat !== values.newPassword) found.repeat = t("password.mismatch");
    setInvalid(found);
    if (Object.keys(found).length === 0) change.mutate();
  };

  const error = change.error;
  // A refused current password belongs to its field; in a restricted session
  // there is no such field, and the refusal means the temporary password expired.
  const errorField: Field | null =
    error instanceof ApiError
      ? error.code === "invalid_credentials"
        ? restricted
          ? null
          : "currentPassword"
        : error.field === "newPassword" || error.field === "currentPassword"
          ? error.field
          : null
      : null;
  const fieldError = (field: Field) => invalid[field] ?? (errorField === field ? errorMessage(error) : undefined);
  const set = (field: Field) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <>
      <h1>{t("page.password.title")}</h1>
      {restricted && <p>{t("password.introRestricted")}</p>}
      <form className={styles.form} onSubmit={submit} noValidate>
        {!restricted && (
          <TextField
            label={t("password.current")}
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={set("currentPassword")}
            error={fieldError("currentPassword")}
          />
        )}
        <TextField
          label={t("password.new")}
          type="password"
          autoComplete="new-password"
          hint={t("password.rules")}
          value={values.newPassword}
          onChange={set("newPassword")}
          error={fieldError("newPassword")}
        />
        <TextField
          label={t("password.repeat")}
          type="password"
          autoComplete="new-password"
          value={values.repeat}
          onChange={set("repeat")}
          error={fieldError("repeat")}
        />
        {change.isError && errorField === null && (
          <div role="alert" className={styles.failure}>
            <p>{errorMessage(error)}</p>
            {restricted && error instanceof ApiError && error.code === "invalid_credentials" && <SignOutButton />}
          </div>
        )}
        <div>
          <Button type="submit" variant="primary" busy={change.isPending}>
            {t("password.submit")}
          </Button>
        </div>
      </form>
    </>
  );
}
