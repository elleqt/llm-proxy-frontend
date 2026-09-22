import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { adminUsersQuery } from "../../../entities/user/adminUsers";
import { ApiError, client, unwrap } from "../../../shared/api/client";
import type { components } from "../../../shared/api/schema";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
import { Button, Modal, Select, TextField } from "../../../shared/ui";
import { TemporaryPassword } from "../TemporaryPassword";
import styles from "../admin.module.css";

type CreateUserRequest = components["schemas"]["CreateUserRequest"];
type CreatedUser = components["schemas"]["CreatedUser"];
type Kind = CreateUserRequest["kind"];

/** "Create user" or "Create service account": separate actions, separate forms. */
export function CreateAccount({ kind }: { kind: Kind }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={kind === "human" ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {t(kind === "human" ? "admin.createUser" : "admin.createService")}
      </Button>
      {/* Mounted only while open: closing drops a temporary password with the dialog's state. */}
      {open && <CreateDialog kind={kind} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [signIn, setSignIn] = useState<"password" | "oidc">("password");
  const [missing, setMissing] = useState<ReadonlySet<"displayName" | "email">>(new Set());
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const create = useMutation({
    mutationFn: (body: CreateUserRequest) => unwrap(client.POST("/api/admin/users", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminUsersQuery.queryKey, exact: true }),
    // With reset() below, a temporary password leaves the mutation cache at once.
    gcTime: 0,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = displayName.trim();
    const address = email.trim();
    const empty = new Set<"displayName" | "email">();
    if (name === "") empty.add("displayName");
    if (kind === "human" && address === "") empty.add("email");
    setMissing(empty);
    if (empty.size > 0) return;
    // Access starts empty — nothing allowed — and is set with the policy editor on the card.
    create.mutate(
      kind === "human"
        ? { kind, displayName: name, email: address, role, signIn, policy: [] }
        : { kind, displayName: name, policy: [] },
      {
        // The temporary password moves into this dialog's state and nowhere else.
        onSuccess: (result) => {
          setCreated(result);
          create.reset();
        },
      },
    );
  };

  if (created !== null) {
    const { user, temporaryPassword } = created;
    return (
      <Modal
        key="created"
        open
        // A temporary password is shown once: a stray click must not throw it away.
        closeOnBackdrop={false}
        onClose={onClose}
        title={fill(t("admin.createdTitle"), { name: user.displayName })}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t("issue.done")}
          </Button>
        }
      >
        {temporaryPassword !== undefined ? (
          <>
            <TemporaryPassword value={temporaryPassword} />
            <p>{t("admin.createdPassword")}</p>
          </>
        ) : user.kind === "service" ? (
          <p>{t("admin.createdService")}</p>
        ) : (
          <p>{fill(t("admin.createdOidc"), { email: user.email ?? "" })}</p>
        )}
        <p>
          <Link to={`/admin/users/${user.id}`}>{t("admin.openAccount")}</Link>
        </p>
      </Modal>
    );
  }

  // `email_taken` names no field in the contract, but it can only be about the address.
  const apiError = create.error instanceof ApiError ? create.error : null;
  const placedOn =
    apiError?.field === "displayName"
      ? "displayName"
      : apiError?.field === "email" || apiError?.code === "email_taken"
        ? "email"
        : null;
  const placed = (field: "displayName" | "email") =>
    missing.has(field) ? t("admin.required") : placedOn === field ? errorMessage(create.error) : undefined;
  return (
    <Modal open onClose={onClose} title={t(kind === "human" ? "admin.createUser" : "admin.createService")}>
      <form className={styles.form} onSubmit={submit} noValidate>
        {kind === "service" && <p className={styles.dim}>{t("admin.serviceIntro")}</p>}
        <TextField
          label={t("admin.displayName")}
          value={displayName}
          autoFocus
          autoComplete="off"
          onChange={(event) => setDisplayName(event.target.value)}
          error={placed("displayName")}
        />
        {kind === "human" && (
          <>
            <TextField
              label={t("admin.email")}
              type="email"
              value={email}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
              error={placed("email")}
            />
            <Select
              label={t("admin.signIn")}
              value={signIn}
              options={[
                { value: "password", label: t("admin.signIn.password") },
                { value: "oidc", label: t("admin.signIn.oidc") },
              ]}
              hint={t(signIn === "password" ? "admin.signInPasswordHint" : "admin.signInOidcHint")}
              onChange={(event) => setSignIn(event.target.value as typeof signIn)}
            />
            <Select
              label={t("admin.role")}
              value={role}
              options={[
                { value: "user", label: t("admin.role.user") },
                { value: "admin", label: t("admin.role.admin") },
              ]}
              onChange={(event) => setRole(event.target.value as typeof role)}
            />
          </>
        )}
        <p className={styles.dim}>{t("admin.policyAfterCreate")}</p>
        {create.isError && placedOn === null && <p role="alert">{errorMessage(create.error)}</p>}
        <div className={styles.dialogActions}>
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" busy={create.isPending}>
            {t(kind === "human" ? "admin.createUserSubmit" : "admin.createServiceSubmit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
