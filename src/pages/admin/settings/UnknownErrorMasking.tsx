import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminConfigQuery } from "../../../entities/config/config";
import { client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { Card, Spinner, Toggle } from "../../../shared/ui";
import styles from "../admin.module.css";

export function UnknownErrorMasking() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const config = useQuery(adminConfigQuery);
  const save = useMutation({
    mutationFn: (maskUnknownErrors: boolean) => unwrap(client.PUT("/api/admin/config", { body: { maskUnknownErrors } })),
    onSuccess: async (saved) => {
      await queryClient.cancelQueries({ queryKey: adminConfigQuery.queryKey });
      queryClient.setQueryData(adminConfigQuery.queryKey, saved);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminConfigQuery.queryKey }),
  });
  return <Card title={t("settings.errors")}>
    {config.isPending ? <Spinner label={t("app.loading")} /> : config.isError ?
      <p role="alert">{errorMessage(config.error)}</p> : <div>
        <Toggle label={t("settings.maskUnknownErrors")} checked={config.data.maskUnknownErrors}
          disabled={save.isPending} onChange={(on) => save.mutate(on)} />
        <p className={styles.dim}>{t("settings.maskUnknownErrorsHint")}</p>
        {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
      </div>}
  </Card>;
}
