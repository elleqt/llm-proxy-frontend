import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RoutingRoleSelect } from "../../entities/provider/AccountRoutingFields";
import { accountName, providerAccountsQuery, type ProviderAccount } from "../../entities/provider/providers";
import { client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";

export function AccountUsageControl({ account }: { account: ProviderAccount }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (priority: number) => unwrap(client.PATCH("/api/admin/providers/{accountId}", {
      params: { path: { accountId: account.id } }, body: { priority },
    })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey }),
    onError: () => { void queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey }); },
  });
  return <div>
    <RoutingRoleSelect label={`${t("routing.role")} · ${accountName(account)}`} value={String(account.priority)}
      disabled={save.isPending} onChange={(value) => save.mutate(Number(value))} />
    {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
  </div>;
}
