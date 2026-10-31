import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AccountRoutingFields, priorityValue } from "../../entities/provider/AccountRoutingFields";
import { accountName, providerAccountsQuery, type ProviderAccount } from "../../entities/provider/providers";
import { QuotaMeters } from "../../entities/provider/QuotaMeters";
import { accountStatus, refreshedAt, StatusDot } from "../../entities/provider/StatusDot";
import { ApiError, client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useLang, useT } from "../../shared/i18n";
import { Button, Modal, useDiscardGuard } from "../../shared/ui";
import { proxyChanged, proxyDirty, proxyInput } from "./proxy";
import { ProxySection, sectionDraft } from "./ProxySection";
import styles from "./AccountDrawer.module.css";

/**
 * A subscription account's drawer: its state, read-only, and its proxy.
 * `removeAction` is the footer's remove control, which lives with the page.
 */
export function AccountDrawer({
  account,
  onClose,
  removeAction,
  now,
}: {
  account: ProviderAccount;
  onClose: () => void;
  removeAction: ReactNode;
  now: number;
}) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const formId = useId();
  const [draft, setDraft] = useState(() => sectionDraft(account.proxy));
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState(false);
  const priority = priorityDraft ?? String(account.priority);
  const priorityEdited = priorityDraft !== null && priority !== String(account.priority);
  const proxyEdited = proxyChanged(draft, account.proxy);
  const changed = proxyEdited || priorityEdited;
  const guard = useDiscardGuard(proxyDirty(draft, account.proxy) || priorityEdited, onClose);
  // gcTime 0: a typed URL may carry the proxy's password; it leaves no cache behind.
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        client.PATCH("/api/admin/providers/{accountId}", {
          params: { path: { accountId: account.id } },
          body: {
            ...(proxyEdited ? { proxy: proxyInput(draft) } : {}),
            ...(priorityEdited ? { priority: priorityValue(priority)! } : {}),
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey });
      onClose();
    },
    gcTime: 0,
  });
  const error = save.error instanceof ApiError ? save.error : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (priorityValue(priority) === undefined) {
      setPriorityError(true);
      return;
    }
    save.mutate();
  };
  const status = accountStatus(account, t);
  const refreshed = refreshedAt(account, now, lang, t);
  return (
    <>
      <Modal
        open
        variant="drawer"
        onClose={guard.requestClose}
        title={
          <span className={styles.title}>
            {/* Decorative: the State section says the same in words. */}
            <StatusDot account={account} now={now} />
            {`${account.provider} · ${accountName(account)}`}
          </span>
        }
        footer={
          <>
            <span>{removeAction}</span>
            <span className={styles.actions}>
              <Button onClick={guard.requestClose}>{t("ui.cancel")}</Button>
              <Button type="submit" form={formId} variant="primary" busy={save.isPending} disabled={!changed}>
                {t("providers.save")}
              </Button>
            </span>
          </>
        }
      >
        <form id={formId} className={styles.form} onSubmit={submit} noValidate>
          <section aria-labelledby={`${formId}-state`}>
            <h3 id={`${formId}-state`} className={styles.heading}>
              {t("providers.state")}
            </h3>
            <dl className={styles.facts}>
              <dt>{t("admin.status")}</dt>
              <dd>{status}</dd>
              <dt>{t("providers.refreshed")}</dt>
              <dd>{refreshed}</dd>
              <dt>{t("providers.quota")}</dt>
              <dd>
                <QuotaMeters quota={account.quota} now={now} />
              </dd>
            </dl>
          </section>
          <AccountRoutingFields value={priority}
            onChange={(value) => { setPriorityDraft(value); setPriorityError(false); }}
            error={priorityError ? t("routing.priorityInvalid") : error?.field === "priority" ? errorMessage(error) : undefined} />
          <ProxySection
            value={draft}
            onChange={setDraft}
            stored={account.proxy}
            error={error?.field === "proxy.url" ? errorMessage(error) : undefined}
          />
          {save.isError && error?.field !== "proxy.url" && <p role="alert">{errorMessage(save.error)}</p>}
        </form>
      </Modal>
      {guard.dialog}
    </>
  );
}
