import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultLimitsQuery, userLimitsKey, type SpendLimit } from "../../../entities/limits/limits";
import { SpendLimitsEditor } from "../../../features/spend-limits/SpendLimitsEditor";
import { client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { Card, Spinner } from "../../../shared/ui";
import styles from "../admin.module.css";

/** The limits every account without its own is held to. */
export function DefaultLimits() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const limits = useQuery(defaultLimitsQuery);
  const save = useMutation({
    mutationFn: (body: SpendLimit[]) => unwrap(client.PUT("/api/admin/limits", { body })),
    onSuccess: (saved) => {
      queryClient.setQueryData(defaultLimitsQuery.queryKey, saved);
      // Every account on the defaults now has other windows.
      void queryClient.invalidateQueries({ queryKey: userLimitsKey });
    },
  });
  return (
    <Card title={t("limits.defaultsTitle")}>
      <p className={styles.dim}>{t("limits.defaultsIntro")}</p>
      {limits.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : limits.isError ? (
        <p role="alert">{errorMessage(limits.error)}</p>
      ) : (
        <SpendLimitsEditor
          value={limits.data}
          onSave={(next) => save.mutate(next)}
          onEdit={save.reset}
          saving={save.isPending}
          error={save.error}
          emptyLabel={t("limits.none")}
        />
      )}
    </Card>
  );
}
