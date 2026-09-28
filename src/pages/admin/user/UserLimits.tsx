import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";
import { userLimitsQuery, type SpendLimits } from "../../../entities/limits/limits";
import { SpendLimitsEditor } from "../../../features/spend-limits/SpendLimitsEditor";
import { SpendWindows } from "../../../features/spend-limits/SpendWindows";
import { client, unwrap } from "../../../shared/api/client";
import type { components } from "../../../shared/api/schema";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
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
  // Where focus goes once a reset or a save removes the button that had it.
  const windowsRef = useRef<HTMLDivElement>(null);
  const defaultRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (body: SpendLimitsUpdate) =>
      unwrap(client.PUT("/api/admin/users/{userId}/limits", { params: { path: { userId } }, body })),
    onSuccess: (saved) => queryClient.setQueryData(userLimitsQuery(userId).queryKey, saved),
  });

  const pick = (next: Mode) => {
    setMode(next);
    save.reset();
  };
  const live = view.windows.some((window) => window.startedAt !== null);

  return (
    <>
      <fieldset className={styles.modes}>
        <legend>{t("limits.mode")}</legend>
        {(["default", "custom"] as const).map((option) => (
          <label key={option}>
            <input
              ref={option === "default" ? defaultRef : undefined}
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
              <Button
                variant="primary"
                busy={save.isPending}
                // Saved, Default is the stored mode and this button goes.
                onClick={() => save.mutate({ mode: "default" }, { onSuccess: () => defaultRef.current?.focus() })}
              >
                {t("limits.save")}
              </Button>
            </div>
          </div>
        )
      )}
      {view.windows.length > 0 && (
        <div ref={windowsRef} tabIndex={-1} className={styles.windows}>
          <SpendWindows
            windows={view.windows}
            actions={(window, per) =>
              window.startedAt !== null && (
                <div className={styles.actions}>
                  <ResetWindows
                    userId={userId}
                    body={{ windowMinutes: window.windowMinutes }}
                    per={per}
                    returnFocus={windowsRef}
                  />
                </div>
              )
            }
          />
          {live && (
            <div className={styles.actions}>
              <ResetWindows userId={userId} body={{}} per={null} returnFocus={windowsRef} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * One window's reset (`per` names it) or every window's (`per` null), behind
 * a confirmation. A reset window is no longer live, so the answer removes
 * this control and its dialog in one render; focus then goes to
 * `returnFocus` instead of dropping to the page.
 */
function ResetWindows({
  userId,
  body,
  per,
  returnFocus,
}: {
  userId: string;
  body: SpendLimitReset;
  per: string | null;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const reset = useMutation({
    mutationFn: () =>
      unwrap(client.POST("/api/admin/users/{userId}/limits/reset", { params: { path: { userId } }, body })),
    onSuccess: (after) => queryClient.setQueryData(userLimitsQuery(userId).queryKey, after),
  });
  return (
    <>
      <Button
        aria-label={per === null ? undefined : fill(t("limits.resetLabel"), { window: per })}
        onClick={() => setOpen(true)}
      >
        {t(per === null ? "limits.resetAll" : "limits.reset")}
      </Button>
      {open && (
        <ConfirmDialog
          title={per === null ? t("limits.resetAllTitle") : fill(t("limits.resetTitle"), { window: per })}
          body={<p>{t(per === null ? "limits.resetAllBody" : "limits.resetBody")}</p>}
          confirmLabel={t(per === null ? "limits.resetAllConfirm" : "limits.resetConfirm")}
          variant="danger"
          busy={reset.isPending}
          error={reset.isError ? errorMessage(reset.error) : null}
          onConfirm={() => reset.mutate()}
          onClose={() => {
            setOpen(false);
            reset.reset();
          }}
          returnFocus={returnFocus}
        />
      )}
    </>
  );
}
