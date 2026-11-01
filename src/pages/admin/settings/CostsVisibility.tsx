import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminConfigQuery, configQuery, type AdminConfigUpdate } from "../../../entities/config/config";
import { client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { Card, Spinner, Toggle } from "../../../shared/ui";
import styles from "../admin.module.css";

/** Whether users are shown their costs in US dollars; saved as soon as it is switched. */
export function CostsVisibility() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const config = useQuery(adminConfigQuery);
  const save = useMutation({
    mutationFn: (body: AdminConfigUpdate) => unwrap(client.PUT("/api/admin/config", { body })),
    onSuccess: async (saved) => {
      await queryClient.cancelQueries({ queryKey: adminConfigQuery.queryKey });
      queryClient.setQueryData(adminConfigQuery.queryKey, saved);
      // The interface's own config follows from it.
      void queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminConfigQuery.queryKey }),
  });
  return (
    <Card title={t("settings.costs")}>
      {config.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : config.isError ? (
        <p role="alert">{errorMessage(config.error)}</p>
      ) : (
        <div>
          <Toggle
            label={t("settings.costsVisible")}
            checked={config.data.costsVisible}
            disabled={save.isPending}
            onChange={(costsVisible) => save.mutate({ costsVisible })}
          />
          <p className={styles.dim}>{t("settings.costsVisibleHint")}</p>
          {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
        </div>
      )}
    </Card>
  );
}
