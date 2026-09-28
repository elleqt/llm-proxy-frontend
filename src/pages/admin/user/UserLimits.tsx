import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { userLimitsQuery, type SpendLimits } from "../../../entities/limits/limits";
import { SpendLimitsEditor } from "../../../features/spend-limits/SpendLimitsEditor";
import { SpendWindows } from "../../../features/spend-limits/SpendWindows";
import { client, unwrap } from "../../../shared/api/client";
import type { components } from "../../../shared/api/schema";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { Button, Card, Spinner } from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import styles from "../admin.module.css";

type SpendLimitsUpdate = components["schemas"]["SpendLimitsUpdate"];
type SpendLimitReset = components["schemas"]["SpendLimitReset"];
type Mode = SpendLimits["mode"];

/** An account's spend limits: the defaults or its own, and its windows with their resets. */
export function UserLimits({ userId }: { userId: string }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const limits = useQuery(userLimitsQuery(userId));
  return (
    <Card title={t("limits.title")}>
      {limits.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : limits.isError ? (
        <p role="alert">{errorMessage(limits.error)}</p>
      ) : (
        <LimitsBody userId={userId} view={limits.data} />
      )}
    </Card>
  );
}

function LimitsBody({ userId, view }: { userId: string; view: SpendLimits }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>(view.mode);
  // A new stored mode (saved here, or changed elsewhere) replaces the one picked.
  const [storedMode, setStoredMode] = useState(view.mode);
  if (storedMode !== view.mode) {
    setStoredMode(view.mode);
    setMode(view.mode);
  }
  const [resetting, setResetting] = useState<SpendLimitReset | null>(null);

  const save = useMutation({
    mutationFn: (body: SpendLimitsUpdate) =>
      unwrap(client.PUT("/api/admin/users/{userId}/limits", { params: { path: { userId } }, body })),
    onSuccess: (saved) => queryClient.setQueryData(userLimitsQuery(userId).queryKey, saved),
  });
  const reset = useMutation({
    mutationFn: (body: SpendLimitReset) =>
      unwrap(client.POST("/api/admin/users/{userId}/limits/reset", { params: { path: { userId } }, body })),
    onSuccess: (after) => queryClient.setQueryData(userLimitsQuery(userId).queryKey, after),
  });

  const pick = (next: Mode) => {
    setMode(next);
    save.reset();
  };
  const closeReset = () => {
    setResetting(null);
    reset.reset();
  };
  const live = view.windows.some((window) => window.startedAt !== null);
  const all = resetting !== null && resetting.windowMinutes === undefined;

  return (
    <>
      <fieldset className={styles.modes}>
        <legend>{t("limits.mode")}</legend>
        {(["default", "custom"] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`limits-mode-${userId}`}
              value={option}
              checked={mode === option}
              onChange={() => pick(option)}
            />
            {t(option === "default" ? "limits.modeDefault" : "limits.modeCustom")}
          </label>
        ))}
      </fieldset>
      {mode === "custom" ? (
        <SpendLimitsEditor
          value={view.custom}
          onSave={(limits) => save.mutate({ mode: "custom", limits })}
          onEdit={save.reset}
          saving={save.isPending}
          error={save.error}
          emptyLabel={t("limits.none")}
        />
      ) : (
        view.mode === "custom" && (
          <div className={styles.form}>
            {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
            <div className={styles.actions}>
              <Button variant="primary" busy={save.isPending} onClick={() => save.mutate({ mode: "default" })}>
                {t("limits.save")}
              </Button>
            </div>
          </div>
        )
      )}
      {view.windows.length > 0 && (
        <div className={styles.windows}>
          <SpendWindows
            windows={view.windows}
            actions={(window) =>
              window.startedAt !== null && (
                <div className={styles.actions}>
                  <Button onClick={() => setResetting({ windowMinutes: window.windowMinutes })}>
                    {t("limits.reset")}
                  </Button>
                </div>
              )
            }
          />
          {live && (
            <div className={styles.actions}>
              <Button onClick={() => setResetting({})}>{t("limits.resetAll")}</Button>
            </div>
          )}
        </div>
      )}
      {resetting !== null && (
        <ConfirmDialog
          title={t(all ? "limits.resetAllTitle" : "limits.resetTitle")}
          body={<p>{t(all ? "limits.resetAllBody" : "limits.resetBody")}</p>}
          confirmLabel={t("limits.resetConfirm")}
          variant="danger"
          busy={reset.isPending}
          error={reset.isError ? errorMessage(reset.error) : null}
          onConfirm={() => reset.mutate(resetting, { onSuccess: closeReset })}
          onClose={closeReset}
        />
      )}
    </>
  );
}
