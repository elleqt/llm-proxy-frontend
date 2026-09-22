import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { adminUsersQuery, type AdminUser } from "../../../entities/user/adminUsers";
import { useErrorMessage, useLang, useT } from "../../../shared/i18n";
import { Badge, EmptyState, Select, Spinner, Table, TextField, type Column } from "../../../shared/ui";
import styles from "../admin.module.css";
import { CreateAccount } from "./CreateAccount";

type Filter<T extends string> = T | "all";

export function AdminUsersPage() {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const users = useQuery(adminUsersQuery);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Filter<AdminUser["kind"]>>("all");
  const [status, setStatus] = useState<Filter<AdminUser["status"]>>("all");
  const [signIn, setSignIn] = useState<Filter<AdminUser["signIn"][number]>>("all");
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  const needle = search.trim().toLocaleLowerCase(lang);
  const shown = (users.data ?? []).filter(
    (user) =>
      (kind === "all" || user.kind === kind) &&
      (status === "all" || user.status === status) &&
      (signIn === "all" || user.signIn.includes(signIn)) &&
      (needle === "" ||
        user.displayName.toLocaleLowerCase(lang).includes(needle) ||
        (user.email ?? "").toLocaleLowerCase(lang).includes(needle)),
  );

  const columns: Column<AdminUser>[] = [
    {
      id: "name",
      header: t("admin.displayName"),
      sortValue: (user) => user.displayName,
      cell: (user) => <Link to={`/admin/users/${user.id}`}>{user.displayName}</Link>,
    },
    {
      id: "email",
      header: t("admin.email"),
      sortValue: (user) => user.email ?? null,
      cell: (user) => user.email ?? "—",
    },
    {
      id: "kind",
      header: t("admin.kind"),
      sortValue: (user) => user.kind,
      cell: (user) => (
        <Badge tone={user.kind === "service" ? "accent" : "neutral"}>{t(`admin.kind.${user.kind}`)}</Badge>
      ),
    },
    {
      id: "signIn",
      header: t("admin.signIn"),
      cell: (user) =>
        user.kind === "service" ? (
          <span className={styles.dim}>{t("admin.signIn.none")}</span>
        ) : (
          user.signIn.map((method) => t(`admin.signIn.${method}`)).join(", ")
        ),
    },
    {
      id: "role",
      header: t("admin.role"),
      sortValue: (user) => user.role,
      cell: (user) => t(`admin.role.${user.role}`),
    },
    {
      id: "status",
      header: t("admin.status"),
      sortValue: (user) => user.status,
      cell: (user) => (
        <Badge tone={user.status === "active" ? "accent" : "muted"}>{t(`admin.status.${user.status}`)}</Badge>
      ),
    },
    {
      id: "lastSeen",
      header: t("admin.lastSeen"),
      sortValue: (user) => (user.lastSeenAt == null ? null : Date.parse(user.lastSeenAt)),
      cell: (user) =>
        user.lastSeenAt == null ? (
          <span className={styles.never}>{t("admin.neverSeen")}</span>
        ) : (
          dateTime.format(new Date(user.lastSeenAt))
        ),
    },
  ];

  return (
    <>
      <div className={styles.titleRow}>
        <h1>{t("page.admin.users.title")}</h1>
        <div className={styles.actions}>
          <CreateAccount kind="human" />
          <CreateAccount kind="service" />
        </div>
      </div>

      <div role="search" aria-label={t("admin.filters")} className={styles.filters}>
        <TextField
          label={t("admin.search")}
          type="search"
          value={search}
          placeholder={t("admin.searchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          label={t("admin.kind")}
          value={kind}
          options={[
            { value: "all", label: t("admin.filter.all") },
            { value: "human", label: t("admin.kind.human") },
            { value: "service", label: t("admin.kind.service") },
          ]}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        />
        <Select
          label={t("admin.status")}
          value={status}
          options={[
            { value: "all", label: t("admin.filter.all") },
            { value: "active", label: t("admin.status.active") },
            { value: "blocked", label: t("admin.status.blocked") },
          ]}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        />
        <Select
          label={t("admin.signIn")}
          value={signIn}
          options={[
            { value: "all", label: t("admin.filter.all") },
            { value: "password", label: t("admin.signIn.password") },
            { value: "oidc", label: t("admin.signIn.oidc") },
          ]}
          onChange={(event) => setSignIn(event.target.value as typeof signIn)}
        />
      </div>

      {users.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : users.isError ? (
        <p role="alert">{errorMessage(users.error)}</p>
      ) : shown.length === 0 ? (
        <EmptyState title={t(users.data.length === 0 ? "admin.noUsers" : "admin.noMatches")} />
      ) : (
        <Table label={t("page.admin.users.title")} columns={columns} rows={shown} rowKey={(user) => user.id} />
      )}
    </>
  );
}
