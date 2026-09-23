import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Link, useParams } from "react-router";
import {
  adminUserActivityQuery,
  adminUserQuery,
  adminUsersQuery,
  adminUserTokensQuery,
  type Activity,
  type AdminUser,
} from "../../../entities/user/adminUsers";
import { authConfigQuery } from "../../../entities/session/authConfig";
import type { Token } from "../../../entities/token/tokens";
import { PolicyEditor } from "../../../features/policy-editor/PolicyEditor";
import { ApiError, client, unwrap } from "../../../shared/api/client";
import type { components } from "../../../shared/api/schema";
import { useErrorMessage, useLang, useT, type MessageKey } from "../../../shared/i18n";
import { formatUSD } from "../../../shared/lib/money";
import { fill } from "../../../shared/lib/template";
import {
  Badge,
  Button,
  Card,
  CopyField,
  EmptyState,
  Modal,
  Select,
  Spinner,
  Table,
  TextField,
  type Column,
} from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { Invitation } from "../Invitation";
import { TemporaryPassword } from "../TemporaryPassword";
import styles from "../admin.module.css";

type UpdateUserRequest = components["schemas"]["UpdateUserRequest"];
type TemporaryPasswordValue = components["schemas"]["TemporaryPassword"];

export function AdminUserPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { userId = "" } = useParams();
  const user = useQuery(adminUserQuery(userId));

  if (user.isPending) return <Spinner label={t("app.loading")} />;
  if (user.isError) {
    return (
      <>
        <h1>{t("page.admin.user.title")}</h1>
        <p role="alert">{errorMessage(user.error)}</p>
        <p>
          <Link to="/admin/users">{t("admin.backToUsers")}</Link>
        </p>
      </>
    );
  }
  const account = user.data;
  return (
    <>
      <p className={styles.back}>
        <Link to="/admin/users">{t("admin.backToUsers")}</Link>
      </p>
      <div className={styles.titleRow}>
        <h1>{account.displayName}</h1>
        <div className={styles.actions}>
          <Badge tone={account.kind === "service" ? "accent" : "neutral"}>{t(`admin.kind.${account.kind}`)}</Badge>
          <Badge tone={account.status === "active" ? "accent" : "muted"}>{t(`admin.status.${account.status}`)}</Badge>
        </div>
      </div>
      <div className={styles.sections}>
        <Details user={account} />
        <Card title={t("policy.title")}>
          {/* Keyed by account: another user's card starts from that user's rules. */}
          <PolicyEditor key={account.id} user={account} />
        </Card>
        <UserTokens user={account} />
        <UserActivity userId={account.id} />
      </div>
    </>
  );
}

/** PATCH the account, then show the answer everywhere it is listed. */
function useUpdateUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateUserRequest) =>
      unwrap(client.PATCH("/api/admin/users/{userId}", { params: { path: { userId } }, body })),
    onSuccess: (updated) => {
      queryClient.setQueryData(adminUserQuery(userId).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: adminUsersQuery.queryKey, exact: true });
    },
  });
}

function Details({ user }: { user: AdminUser }) {
  const t = useT();
  const [lang] = useLang();
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const human = user.kind === "human";
  const oidc = useQuery(authConfigQuery).data?.oidc.enabled === true;
  return (
    <Card title={t("admin.account")} actions={<BlockToggle user={user} />}>
      <dl className={styles.details}>
        <div>
          <dt>{t("admin.email")}</dt>
          <dd>{user.email ?? "—"}</dd>
        </div>
        {user.kind === "human" && (
          <div>
            <dt>{t("admin.signIn")}</dt>
            <dd>{user.signIn.map((method) => t(`admin.signIn.${method}`)).join(", ") || t("admin.signIn.none")}</dd>
          </div>
        )}
        <div>
          <dt>{t("admin.created")}</dt>
          <dd>{dateTime.format(new Date(user.createdAt))}</dd>
        </div>
        <div>
          <dt>{t("admin.lastSeen")}</dt>
          <dd>
            {user.lastSeenAt == null ? (
              <span className={styles.never}>{t("admin.neverSeen")}</span>
            ) : (
              dateTime.format(new Date(user.lastSeenAt))
            )}
          </dd>
        </div>
      </dl>
      {user.mustChangePassword && <p className={styles.dim}>{t("admin.mustChangePassword")}</p>}
      {/* A person not linked to the identity provider can be invited to sign in through it while that sign-in is on. */}
      {oidc && human && user.email != null && !user.signIn.includes("oidc") && <Invitation user={user} />}
      <div className={styles.inlineForms}>
        <RoleForm user={user} />
        {/* Any person can be given a temporary password; a service account has none. */}
        {human && <PasswordReset user={user} />}
      </div>
    </Card>
  );
}

function BlockToggle({ user }: { user: AdminUser }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const update = useUpdateUser(user.id);
  const blocking = user.status === "active";
  const close = () => {
    setOpen(false);
    update.reset();
  };
  return (
    <>
      <Button variant={blocking ? "danger" : "secondary"} onClick={() => setOpen(true)}>
        {t(blocking ? "admin.block" : "admin.unblock")}
      </Button>
      {open && (
        <ConfirmDialog
          title={fill(t(blocking ? "admin.blockTitle" : "admin.unblockTitle"), { name: user.displayName })}
          body={<p>{t(blocking ? "admin.blockBody" : "admin.unblockBody")}</p>}
          confirmLabel={fill(t(blocking ? "admin.blockConfirm" : "admin.unblockConfirm"), { name: user.displayName })}
          variant={blocking ? "danger" : "primary"}
          busy={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onConfirm={() => update.mutate({ status: blocking ? "blocked" : "active" }, { onSuccess: close })}
          onClose={close}
        />
      )}
    </>
  );
}

function RoleForm({ user }: { user: AdminUser }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [role, setRole] = useState(user.role);
  const update = useUpdateUser(user.id);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ role });
  };
  return (
    <form className={styles.inlineForm} onSubmit={submit}>
      <Select
        label={t("admin.role")}
        value={role}
        options={[
          { value: "user", label: t("admin.role.user") },
          { value: "admin", label: t("admin.role.admin") },
        ]}
        onChange={(event) => {
          update.reset();
          setRole(event.target.value as typeof role);
        }}
      />
      <Button type="submit" busy={update.isPending} disabled={role === user.role}>
        {t("admin.changeRole")}
      </Button>
      {update.isError && <p role="alert">{errorMessage(update.error)}</p>}
    </form>
  );
}

function PasswordReset({ user }: { user: AdminUser }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.inlineForm}>
      <Button onClick={() => setOpen(true)}>{t("admin.resetPassword")}</Button>
      {/* Mounted only while open: closing drops the temporary password. */}
      {open && <PasswordResetDialog user={user} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PasswordResetDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState<TemporaryPasswordValue | null>(null);
  const reset = useMutation({
    mutationFn: () =>
      unwrap(client.POST("/api/admin/users/{userId}/password-reset", { params: { path: { userId: user.id } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminUserQuery(user.id).queryKey }),
    // With reset() below, the password leaves the mutation cache at once.
    gcTime: 0,
  });

  if (password !== null) {
    return (
      <Modal
        key="reset"
        open
        // Shown once: a stray click must not throw it away.
        closeOnBackdrop={false}
        onClose={onClose}
        title={fill(t("admin.resetDoneTitle"), { name: user.displayName })}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t("issue.done")}
          </Button>
        }
      >
        <TemporaryPassword value={password} />
        <p>{t("admin.createdPassword")}</p>
      </Modal>
    );
  }
  return (
    <ConfirmDialog
      title={fill(t("admin.resetTitle"), { name: user.displayName })}
      body={<p>{t("admin.resetBody")}</p>}
      confirmLabel={t("admin.resetConfirm")}
      busy={reset.isPending}
      error={reset.isError ? errorMessage(reset.error) : null}
      onConfirm={() =>
        reset.mutate(undefined, {
          // The password moves into this dialog's state and nowhere else.
          onSuccess: (result) => {
            setPassword(result);
            reset.reset();
          },
        })
      }
      onClose={onClose}
    />
  );
}

function UserTokens({ user }: { user: AdminUser }) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const tokens = useQuery(adminUserTokensQuery(user.id));
  const listRef = useRef<HTMLDivElement>(null);
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  const columns: Column<Token>[] = [
    { id: "label", header: t("tokens.label"), cell: (token) => token.label },
    {
      id: "prefix",
      header: t("tokens.prefix"),
      mono: true,
      // The prefix is all the server keeps: shown whole, as in the cabinet.
      cell: (token) => <span className={styles.nowrap}>{token.prefix}</span>,
    },
    { id: "created", header: t("tokens.created"), cell: (token) => dateTime.format(new Date(token.createdAt)) },
    {
      id: "lastUsed",
      header: t("tokens.lastUsed"),
      cell: (token) =>
        token.lastUsedAt == null ? (
          <span className={styles.never}>{t("tokens.neverUsed")}</span>
        ) : (
          dateTime.format(new Date(token.lastUsedAt))
        ),
    },
    {
      id: "state",
      header: t("tokens.state"),
      cell: (token) =>
        token.revokedAt == null ? (
          <Badge tone="accent">{t("tokens.active")}</Badge>
        ) : (
          <Badge tone="muted">{t("tokens.revoked")}</Badge>
        ),
    },
    {
      id: "actions",
      header: <span className={styles.visuallyHidden}>{t("tokens.actions")}</span>,
      align: "end",
      cell: (token) =>
        token.revokedAt == null ? <RevokeUserToken user={user} token={token} returnFocus={listRef} /> : null,
    },
  ];

  return (
    <Card title={t("admin.tokens")} actions={user.kind === "service" ? <IssueOnBehalf user={user} /> : undefined}>
      {user.kind === "service" && <p className={styles.dim}>{t("admin.serviceTokens")}</p>}
      {tokens.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : tokens.isError ? (
        <p role="alert">{errorMessage(tokens.error)}</p>
      ) : tokens.data.length === 0 ? (
        <EmptyState title={t("admin.noTokens")} />
      ) : (
        <div ref={listRef} tabIndex={-1}>
          <Table label={t("admin.tokens")} columns={columns} rows={tokens.data} rowKey={(token) => token.id} />
        </div>
      )}
    </Card>
  );
}

function RevokeUserToken({
  user,
  token,
  returnFocus,
}: {
  user: AdminUser;
  token: Token;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const revoke = useMutation({
    mutationFn: () =>
      unwrap(
        client.DELETE("/api/admin/users/{userId}/tokens/{tokenId}", {
          params: { path: { userId: user.id, tokenId: token.id } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminUserTokensQuery(user.id).queryKey });
      setOpen(false);
    },
  });
  const service = user.kind === "service";
  return (
    <>
      <Button aria-label={fill(t("revoke.openLabel"), { label: token.label })} onClick={() => setOpen(true)}>
        {t("revoke.open")}
      </Button>
      {open && (
        <ConfirmDialog
          title={fill(t("revoke.title"), { label: token.label })}
          body={
            <p>
              {fill(t(service ? "admin.revokeServiceBody" : "revoke.body"), {
                label: token.label,
                name: user.displayName,
              })}
            </p>
          }
          // A service account's token stands for a running integration: revoking stops all of it.
          typeToConfirm={service ? token.label : undefined}
          confirmLabel={t("revoke.confirm")}
          busy={revoke.isPending}
          error={revoke.isError ? errorMessage(revoke.error) : null}
          onConfirm={() => revoke.mutate()}
          onClose={() => {
            setOpen(false);
            revoke.reset();
          }}
          returnFocus={returnFocus}
        />
      )}
    </>
  );
}

function IssueOnBehalf({ user }: { user: AdminUser }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("admin.issueToken")}
      </Button>
      {/* Mounted only while open: closing drops the secret with the dialog's state. */}
      {open && <IssueOnBehalfDialog user={user} onClose={() => setOpen(false)} />}
    </>
  );
}

function IssueOnBehalfDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  // A key, not text: it is translated at render, so it follows a language switch.
  const [labelError, setLabelError] = useState<MessageKey | null>(null);
  const [issued, setIssued] = useState<{ label: string; secret: string } | null>(null);
  const issue = useMutation({
    mutationFn: (body: components["schemas"]["IssueTokenRequest"]) =>
      unwrap(client.POST("/api/admin/users/{userId}/tokens", { params: { path: { userId: user.id } }, body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminUserTokensQuery(user.id).queryKey }),
    // With reset() below, the secret leaves the mutation cache at once.
    gcTime: 0,
  });

  const labelRefused = issue.error instanceof ApiError && issue.error.field === "label";

  if (issued !== null) {
    return (
      <Modal
        key="issued"
        open
        // A stray click must not throw away a secret that is shown only once.
        closeOnBackdrop={false}
        onClose={onClose}
        title={fill(t("admin.issuedTitle"), { name: user.displayName })}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t("issue.done")}
          </Button>
        }
      >
        <CopyField label={fill(t("issue.secretLabel"), { label: issued.label })} value={issued.secret} />
      </Modal>
    );
  }

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
          setIssued({ label: token.label, secret });
          issue.reset();
        },
      },
    );
  };
  return (
    <Modal open onClose={onClose} title={fill(t("admin.issueTitle"), { name: user.displayName })}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t("issue.label")}
          hint={t("admin.issueLabelHint")}
          value={label}
          maxLength={64}
          autoComplete="off"
          autoFocus
          onChange={(event) => setLabel(event.target.value)}
          error={labelError === null ? (labelRefused ? errorMessage(issue.error) : undefined) : t(labelError)}
        />
        {issue.isError && !labelRefused && <p role="alert">{errorMessage(issue.error)}</p>}
        <div className={styles.dialogActions}>
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" busy={issue.isPending}>
            {t("issue.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Rows carry their position: two entries may share every field shown.
type RequestRow = Activity["requests"][number] & { index: number };
type AuditRow = Activity["audit"][number] & { index: number };

function UserActivity({ userId }: { userId: string }) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const activity = useQuery(adminUserActivityQuery(userId));
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "medium" });
  const number = new Intl.NumberFormat(lang);

  const requestColumns: Column<RequestRow>[] = [
    { id: "at", header: t("admin.at"), cell: (row) => dateTime.format(new Date(row.at)) },
    { id: "model", header: t("usage.model"), mono: true, cell: (row) => `${row.provider}:${row.model}` },
    { id: "status", header: t("admin.statusCode"), align: "end", cell: (row) => row.statusCode },
    { id: "tokens", header: t("usage.tokens"), align: "end", cell: (row) => number.format(row.tokensTotal) },
    // Null: the request could not be priced (no price for the model when it was served).
    { id: "cost", header: t("usage.cost"), align: "end", cell: (row) => (row.costUSD == null ? "—" : formatUSD(lang, row.costUSD)) },
    {
      id: "latency",
      header: t("admin.latency"),
      align: "end",
      cell: (row) => fill(t("admin.ms"), { ms: number.format(row.latencyMs) }),
    },
    { id: "stream", header: t("admin.stream"), cell: (row) => t(row.stream ? "admin.yes" : "admin.no") },
  ];
  const auditColumns: Column<AuditRow>[] = [
    { id: "at", header: t("admin.at"), cell: (row) => dateTime.format(new Date(row.at)) },
    { id: "action", header: t("admin.action"), mono: true, cell: (row) => row.action },
    { id: "target", header: t("admin.target"), mono: true, cell: (row) => <AuditTarget target={row.target} /> },
  ];

  return (
    <Card title={t("admin.activity")}>
      {activity.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : activity.isError ? (
        <p role="alert">{errorMessage(activity.error)}</p>
      ) : (
        <>
          <h3>{t("admin.recentRequests")}</h3>
          {activity.data.requests.length === 0 ? (
            <p className={styles.dim}>{t("admin.noRequests")}</p>
          ) : (
            <Table
              label={t("admin.recentRequests")}
              columns={requestColumns}
              rows={activity.data.requests.map((row, index) => ({ ...row, index }))}
              rowKey={(row) => String(row.index)}
            />
          )}
          <h3>{t("admin.audit")}</h3>
          {activity.data.audit.length === 0 ? (
            <p className={styles.dim}>{t("admin.noAudit")}</p>
          ) : (
            <Table
              label={t("admin.audit")}
              columns={auditColumns}
              rows={activity.data.audit.map((row, index) => ({ ...row, index }))}
              rowKey={(row) => String(row.index)}
            />
          )}
        </>
      )}
    </Card>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An audit target: an account id becomes that account's name, linked to its card. */
function AuditTarget({ target }: { target: string | undefined }) {
  const isAccount = target !== undefined && UUID.test(target);
  const users = useQuery({ ...adminUsersQuery, enabled: isAccount });
  if (target === undefined) return "—";
  if (!isAccount) return target;
  const account = users.data?.find((user) => user.id === target);
  return (
    <Link to={`/admin/users/${target}`} title={target}>
      {account?.displayName ?? `${target.slice(0, 8)}…`}
    </Link>
  );
}
