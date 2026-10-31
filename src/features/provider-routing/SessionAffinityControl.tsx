import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsQuery } from "../../entities/settings/settings";
import { client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";
import { Card, Spinner, Toggle } from "../../shared/ui";

export function SessionAffinityControl() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery);
  const save = useMutation({
    mutationFn: (sessionAffinity: boolean) => unwrap(client.PUT("/api/admin/settings", {
      body: { fields: { sessionAffinity }, dryRun: false },
    })),
    onSuccess: async (result) => {
      await queryClient.cancelQueries({ queryKey: settingsQuery.queryKey });
      queryClient.setQueryData(settingsQuery.queryKey, result.settings);
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey }); },
  });
  return <Card title={t("routing.title")}>
    <p>{t("routing.hint")}</p>
    {settings.isPending ? <Spinner label={t("app.loading")} /> : settings.isError ?
      <p role="alert">{errorMessage(settings.error)}</p> : <>
        <Toggle label={t("settings.sessionAffinity")} checked={settings.data.fields.sessionAffinity ?? true}
          disabled={save.isPending} onChange={(on) => save.mutate(on)} />
        <p>{t("settings.sessionAffinityHint")}</p>
      </>}
    {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
  </Card>;
}
