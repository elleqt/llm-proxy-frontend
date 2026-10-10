import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { accountName, providerAccountsQuery, type ProviderAccount } from "../../../entities/provider/providers";
import { QuotaMeters } from "../../../entities/provider/QuotaMeters";
import { accountStatus, StatusDot } from "../../../entities/provider/StatusDot";
import { AccountDrawer } from "../../../features/account-proxy/AccountDrawer";
import { ProxyCell } from "../../../features/account-proxy/ProxyCell";
import { CompatDrawer } from "../../../features/compat-provider/CompatDrawer";
import { AddProviderAccount } from "../../../features/provider-login/ProviderLogin";
import { client, unwrap } from "../../../shared/api/client";
import type { components } from "../../../shared/api/schema";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
import { EmptyState, IconButton, PencilIcon, Spinner, Toggle, TrashIcon } from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import admin from "../admin.module.css";
import styles from "./AdminProvidersPage.module.css";

/** Models a compat row shows as tags; the rest wait behind "+N". */
const SHOWN_MODELS = 4;

export function AdminProvidersPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const accounts = useQuery(providerAccountsQuery);
  // Where focus goes when the row that held it is removed: the heading, which outlives
  // the list (removing the last account replaces it with the empty state).
  const headingRef = useRef<HTMLHeadingElement>(null);
  // "resets in 4 h 12 min" counts down while the page is open.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [addingCompat, setAddingCompat] = useState(false);
  // In the API's order: provider, then account.
  const subscriptions = accounts.data?.filter((a) => a.compat === undefined) ?? [];
  const compat = accounts.data?.filter((a) => a.compat !== undefined) ?? [];

  return (
    <div className={styles.page}>
      <div className={admin.titleRow}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
          {t("page.admin.providers.title")}
        </h1>
        <div className={admin.actions}>
          <AddProviderAccount onCompat={() => setAddingCompat(true)} />
        </div>
        {addingCompat && <CompatDrawer onClose={() => setAddingCompat(false)} />}
      </div>
      {accounts.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : accounts.isError ? (
        <p role="alert">{errorMessage(accounts.error)}</p>
      ) : accounts.data.length === 0 ? (
        <EmptyState title={t("providers.empty")} body={t("providers.emptyBody")} />
      ) : (
        <div className={styles.groups}>
          {subscriptions.length > 0 && (
            <Group
              title={t("providers.subscriptions")}
              columns={[t("providers.account"), t("providers.quota"), t("proxy.column")]}
              accounts={subscriptions}
              now={now}
              returnFocus={headingRef}
            />
          )}
          {compat.length > 0 && (
            <Group
              title={t("providers.compatGroup")}
              columns={[t("providers.provider"), t("compat.models"), t("proxy.column")]}
              accounts={compat}
              now={now}
              returnFocus={headingRef}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A group of accounts under its heading, with column headers lined up on its rows. */
function Group({
  title,
  columns,
  accounts,
  now,
  returnFocus,
}: {
  title: string;
  columns: string[];
  accounts: ProviderAccount[];
  now: number;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.groupTitle}>
        {title}
      </h2>
      {/* Visual only: each row names its parts itself. */}
      <div aria-hidden className={styles.head}>
        {columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
        <span />
      </div>
      {/* `role` restores the list semantics `list-style: none` takes away in some browsers. */}
      <ul role="list" className={styles.rows}>
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} now={now} returnFocus={returnFocus} />
        ))}
      </ul>
    </section>
  );
}

/** One account: who it is, its quotas or models, its proxy, and its actions; the pencil opens its drawer. */
function AccountRow({
  account,
  now,
  returnFocus,
}: {
  account: ProviderAccount;
  now: number;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const name = accountName(account);
  const compat = account.compat;
  const remove = <RemoveAccount account={account} returnFocus={returnFocus} />;
  return (
    <li className={styles.row} data-disabled={account.disabled || undefined} aria-labelledby={`${id}-name ${id}-sub`}>
      <div className={styles.who}>
        <div className={styles.name}>
          <StatusDot account={account} now={now} />
          <span id={`${id}-name`}>{compat?.name ?? account.provider}</span>
          {/* The dot's state in words. */}
          <span className={styles.visuallyHidden}>{accountStatus(account, t)}</span>
        </div>
        <div id={`${id}-sub`} className={compat === undefined ? styles.sub : `${styles.sub} ${styles.mono}`}>
          {compat?.baseURL ?? name}
        </div>
        {account.lastError && <p className={styles.lastError}>{account.lastError}</p>}
      </div>
      <div className={styles.main}>
        {compat === undefined ? (
          <QuotaMeters quota={account.quota} now={now} />
        ) : (
          <ModelTags models={compat.models} name={compat.name} />
        )}
      </div>
      <div className={styles.proxy}>
        <ProxyCell proxy={account.proxy} />
      </div>
      <div className={styles.actions}>
        <EnabledToggle account={account} />
        <IconButton label={fill(t("providers.editLabel"), { name })} onClick={() => setEditing(true)}>
          <PencilIcon />
        </IconButton>
        {remove}
      </div>
      {editing &&
        (compat === undefined ? (
          <AccountDrawer account={account} onClose={() => setEditing(false)} removeAction={remove} now={now} />
        ) : (
          <CompatDrawer account={account} onClose={() => setEditing(false)} removeAction={remove} />
        ))}
    </li>
  );
}

type CompatModel = components["schemas"]["CompatModel"];

function ModelTag({ model }: { model: CompatModel }) {
  return (
    <li className={styles.tag}>
      {model.name}
      {model.alias !== undefined && <span className={styles.alias}> → {model.alias}</span>}
    </li>
  );
}

/** A compat provider's served models as tags: the first four, the rest behind a "+N" popover. */
function ModelTags({ models, name }: { models: CompatModel[]; name: string }) {
  const t = useT();
  const rest = models.slice(SHOWN_MODELS);
  return (
    <ul className={styles.tags} aria-label={t("compat.models")}>
      {models.slice(0, SHOWN_MODELS).map((model) => (
        <ModelTag key={model.name} model={model} />
      ))}
      {rest.length > 0 && (
        <li className={styles.more}>
          <MoreModels models={rest} name={name} />
        </li>
      )}
    </ul>
  );
}

/**
 * The "+N" button and its non-modal popover of the remaining models. Hover, focus or a
 * click opens it (a click pins it); Escape and focus leaving close it.
 */
function MoreModels({ models, name }: { models: CompatModel[]; name: string }) {
  const t = useT();
  const popoverId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hovered || focused || pinned);
  useEffect(() => {
    if (!open) return;
    // Wherever focus is: the popover may have opened under the pointer.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return (
    <span
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={styles.moreButton}
        aria-label={fill(t("providers.moreModels"), { n: models.length })}
        aria-expanded={open}
        aria-controls={popoverId}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
          setDismissed(false);
        }}
        onClick={() => {
          // A click pins an open popover, or closes a pinned one.
          setPinned(!(open && pinned));
          setDismissed(open && pinned);
        }}
      >
        +{models.length}
      </button>
      <div
        id={popoverId}
        role="dialog"
        aria-label={fill(t("providers.moreModelsTitle"), { name })}
        className={styles.popover}
        hidden={!open}
      >
        <ul className={styles.tags}>
          {models.map((model) => (
            <ModelTag key={model.name} model={model} />
          ))}
        </ul>
      </div>
    </span>
  );
}

/** The row's "Enabled" switch: turning it off asks first, turning it on acts at once. */
function EnabledToggle({ account }: { account: ProviderAccount }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
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
      setConfirming(false);
    },
  });
  return (
    <>
      <Toggle
        label={fill(t("providers.enabledLabel"), { name })}
        hideLabel
        checked={!account.disabled}
        onChange={(enabled) => {
          if (update.isPending) return;
          // Enabling puts a known account back in rotation: nothing to confirm.
          if (enabled) update.mutate(false);
          else setConfirming(true);
        }}
      />
      {/* Only the enabling's failure: the confirmation shows its own. */}
      {update.isError && !confirming && (
        <p role="alert" className={styles.actionError}>
          {errorMessage(update.error)}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={fill(t("providers.disableTitle"), { name })}
          body={<p>{t("providers.disableBody")}</p>}
          confirmLabel={fill(t("providers.disableConfirm"), { name })}
          busy={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onConfirm={() => update.mutate(true)}
          onClose={() => {
            setConfirming(false);
            update.reset();
          }}
        />
      )}
    </>
  );
}

/** The red trash button and its type-to-confirm dialog; the row and the drawer's footer both carry one. */
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
      // The row leaves with the account and takes this dialog with it; focus then goes
      // to `returnFocus`. Closing first would hand focus to the trash button about to go.
      if (queryClient.getQueryData(providerAccountsQuery.queryKey)?.some((a) => a.id === account.id)) setOpen(false);
    },
  });
  return (
    <>
      <IconButton label={fill(t("providers.removeLabel"), { name })} tone="danger" onClick={() => setOpen(true)}>
        <TrashIcon />
      </IconButton>
      {open && (
        <ConfirmDialog
          title={fill(t("providers.removeTitle"), { name })}
          body={<p>{t(account.compat === undefined ? "providers.removeBody" : "providers.removeCompatBody")}</p>}
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
