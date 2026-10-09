import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { accountName, providerAccountsQuery, type ProviderAccount } from "../../entities/provider/providers";
import { ApiError, client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, Modal } from "../../shared/ui";
import { proxyChanged, proxyDraft, proxyInput } from "./proxy";
import { ProxyFields } from "./ProxyFields";
import styles from "./AccountProxy.module.css";

/** The "Proxy" action of an account's row: a dialog choosing how its traffic leaves the gateway. */
export function AccountProxyAction({ account }: { account: ProviderAccount }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-label={fill(t("proxy.editLabel"), { name: accountName(account) })} onClick={() => setOpen(true)}>
        {t("proxy.edit")}
      </Button>
      {open && <AccountProxyDialog account={account} onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountProxyDialog({ account, onClose }: { account: ProviderAccount; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => proxyDraft(account.proxy));
  // gcTime 0: a typed URL may carry the proxy's password; it leaves no cache behind.
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        client.PATCH("/api/admin/providers/{accountId}", {
          params: { path: { accountId: account.id } },
          body: { proxy: proxyInput(draft) },
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
    save.mutate();
  };
  return (
    <Modal
      open
      // A typed URL is lost on close: no closing by a stray click.
      closeOnBackdrop={false}
      onClose={onClose}
      title={fill(t("proxy.title"), { name: accountName(account) })}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <ProxyFields
          value={draft}
          onChange={setDraft}
          stored={account.proxy}
          error={error?.field === "proxy.url" ? errorMessage(error) : undefined}
        />
        {save.isError && error?.field !== "proxy.url" && <p role="alert">{errorMessage(save.error)}</p>}
        <div className={styles.actions}>
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" busy={save.isPending} disabled={!proxyChanged(draft, account.proxy)}>
            {t("proxy.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
