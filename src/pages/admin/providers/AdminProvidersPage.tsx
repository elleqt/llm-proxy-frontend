import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";
import { accountName, providerAccountsQuery, type ProviderAccount } from "../../../entities/provider/providers";
import { AddProviderAccount } from "../../../features/provider-login/ProviderLogin";
import { client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useLang, useT } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
import { Badge, Button, EmptyState, Spinner, Table, type Column } from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import styles from "../admin.module.css";

export function AdminProvidersPage() {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const accounts = useQuery(providerAccountsQuery);
  const listRef = useRef<HTMLDivElement>(null);
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const percent = new Intl.NumberFormat(lang, { style: "percent" });

  const columns: Column<ProviderAccount>[] = [
    {
      id: "provider",
      header: t("providers.provider"),
      mono: true,
      sortValue: (a) => a.provider,
      cell: (a) => a.provider,
    },
    { id: "name", header: t("providers.account"), sortValue: (a) => accountName(a), cell: (a) => accountName(a) },
    {
      id: "status",
      header: t("admin.status"),
      sortValue: (a) => (a.disabled ? "disabled" : a.status),
      cell: (a) =>
        a.disabled ? (
          <Badge tone="muted">{t("providers.disabled")}</Badge>
        ) : (
          <Badge tone={a.status === "active" ? "accent" : "neutral"}>
            {/* The vendor's own word when it is not one the interface knows. */}
            {a.status === "active"
              ? t("providers.status.active")
              : a.status === "error"
                ? t("providers.status.error")
                : a.status}
          </Badge>
        ),
    },
    {
      id: "lastError",
      header: t("providers.lastError"),
      cell: (a) =>
        a.lastError ? <span className={styles.error}>{a.lastError}</span> : <span className={styles.dim}>—</span>,
    },
    {
      id: "refreshed",
      header: t("providers.refreshed"),
      sortValue: (a) => (a.lastRefreshedAt == null ? null : Date.parse(a.lastRefreshedAt)),
      cell: (a) =>
        a.lastRefreshedAt == null ? (
          <span className={styles.never}>{t("providers.never")}</span>
        ) : (
          dateTime.format(new Date(a.lastRefreshedAt))
        ),
    },
    {
      id: "quota",
      header: t("providers.quota"),
      cell: (a) =>
        a.quota.length === 0 ? (
          <span className={styles.dim}>{t("providers.noQuota")}</span>
        ) : (
          <ul className={styles.quotas}>
            {a.quota.map((window) => {
              const used = percent.format(window.usedRatio);
              return (
                <li key={window.window} className={styles.quota}>
                  <span className={styles.quotaWindow}>{window.window}</span>
                  <span
                    role="meter"
                    aria-label={fill(t("providers.quotaLabel"), { window: window.window })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(window.usedRatio * 100)}
                    aria-valuetext={used}
                    className={styles.bar}
                  >
                    <span
                      className={styles.barFill}
                      style={{ width: `${Math.min(1, Math.max(0, window.usedRatio)) * 100}%` }}
                    />
                  </span>
                  <span className={styles.quotaText}>
                    {used}
                    {window.resetAt != null &&
                      ` · ${fill(t("providers.resets"), { time: dateTime.format(new Date(window.resetAt)) })}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ),
    },
    {
      id: "actions",
      header: <span className={styles.visuallyHidden}>{t("tokens.actions")}</span>,
      align: "end",
      cell: (a) => (
        <div className={styles.rowActions}>
          <DisableToggle account={a} />
          <RemoveAccount account={a} returnFocus={listRef} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className={styles.titleRow}>
        <h1>{t("page.admin.providers.title")}</h1>
        <div className={styles.actions}>
          <AddProviderAccount />
        </div>
      </div>
      {accounts.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : accounts.isError ? (
        <p role="alert">{errorMessage(accounts.error)}</p>
      ) : accounts.data.length === 0 ? (
        <EmptyState title={t("providers.empty")} body={t("providers.emptyBody")} />
      ) : (
        <div ref={listRef} tabIndex={-1}>
          <Table label={t("page.admin.providers.title")} columns={columns} rows={accounts.data} rowKey={(a) => a.id} />
        </div>
      )}
    </>
  );
}

function DisableToggle({ account }: { account: ProviderAccount }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const name = accountName(account);
  const update = useMutation({
    mutationFn: (disabled: boolean) =>
      unwrap(
        client.PATCH("/api/admin/providers/{accountId}", {
          params: { path: { accountId: account.id } },
          body: { disabled },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey });
      setOpen(false);
    },
  });
  if (account.disabled) {
    // Enabling puts a known account back in rotation: nothing to confirm.
    return (
      <>
        <Button
          aria-label={fill(t("providers.enableLabel"), { name })}
          busy={update.isPending}
          onClick={() => update.mutate(false)}
        >
          {t("providers.enable")}
        </Button>
        {update.isError && <span role="alert">{errorMessage(update.error)}</span>}
      </>
    );
  }
  return (
    <>
      <Button aria-label={fill(t("providers.disableLabel"), { name })} onClick={() => setOpen(true)}>
        {t("providers.disable")}
      </Button>
      {open && (
        <ConfirmDialog
          title={fill(t("providers.disableTitle"), { name })}
          body={<p>{t("providers.disableBody")}</p>}
          confirmLabel={fill(t("providers.disableConfirm"), { name })}
          busy={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onConfirm={() => update.mutate(true)}
          onClose={() => {
            setOpen(false);
            update.reset();
          }}
        />
      )}
    </>
  );
}

function RemoveAccount({
  account,
  returnFocus,
}: {
  account: ProviderAccount;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const name = accountName(account);
  const remove = useMutation({
    mutationFn: () =>
      unwrap(client.DELETE("/api/admin/providers/{accountId}", { params: { path: { accountId: account.id } } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey });
      setOpen(false);
    },
  });
  return (
    <>
      <Button aria-label={fill(t("providers.removeLabel"), { name })} onClick={() => setOpen(true)}>
        {t("providers.remove")}
      </Button>
      {open && (
        <ConfirmDialog
          title={fill(t("providers.removeTitle"), { name })}
          body={<p>{t("providers.removeBody")}</p>}
          typeToConfirm={name}
          confirmLabel={t("providers.removeConfirm")}
          busy={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => remove.mutate()}
          onClose={() => {
            setOpen(false);
            remove.reset();
          }}
          returnFocus={returnFocus}
        />
      )}
    </>
  );
}
