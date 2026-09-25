import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { settingsQuery, type Settings, type SettingsUpdateRequest } from "../../../entities/settings/settings";
import { ApiError, client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
import { Button, Card, CodeEditor, CopyButton, DiffView, Spinner, Tabs, TextField } from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { Prices } from "./Prices";
import styles from "../admin.module.css";

export function AdminSettingsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const settings = useQuery(settingsQuery);
  return (
    <>
      <h1>{t("page.admin.settings.title")}</h1>
      <div className={styles.sections}>
        <Card title={t("settings.gateway")}>
          {settings.isPending ? (
            <Spinner label={t("app.loading")} />
          ) : settings.isError ? (
            <p role="alert">{errorMessage(settings.error)}</p>
          ) : (
            <SettingsEditor settings={settings.data} />
          )}
        </Card>
        <Prices />
      </div>
    </>
  );
}

type FieldName = "proxyURL" | "requestRetry" | "maxRetryInterval";
type FieldValues = Record<FieldName, string>;

function fieldValues(settings: Settings): FieldValues {
  const { proxyURL, requestRetry, maxRetryInterval } = settings.fields;
  return {
    proxyURL: proxyURL ?? "",
    requestRetry: requestRetry === undefined ? "" : String(requestRetry),
    maxRetryInterval: maxRetryInterval === undefined ? "" : String(maxRetryInterval),
  };
}

/** A whole number of 0 or more, or `undefined` when the text is not one. */
function count(text: string): number | undefined {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
}

function SettingsEditor({ settings }: { settings: Settings }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"fields" | "yaml">("fields");
  const [fields, setFields] = useState(() => fieldValues(settings));
  const [yaml, setYaml] = useState(settings.yaml);
  const [checked, setChecked] = useState<{ key: string; diff: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState(false);

  const retry = count(fields.requestRetry);
  const interval = count(fields.maxRetryInterval);
  const numberErrors: Partial<Record<FieldName, string>> = {
    ...(retry === undefined && { requestRetry: t("settings.wholeNumber") }),
    ...(interval === undefined && { maxRetryInterval: t("settings.wholeNumber") }),
  };
  const body: Omit<SettingsUpdateRequest, "dryRun"> | null =
    mode === "yaml"
      ? { yaml }
      : retry === undefined || interval === undefined
        ? null
        : { fields: { proxyURL: fields.proxyURL.trim(), requestRetry: retry, maxRetryInterval: interval } };
  const bodyKey = JSON.stringify(body);

  const put = useMutation({
    mutationFn: (request: SettingsUpdateRequest) => unwrap(client.PUT("/api/admin/settings", { body: request })),
  });

  const edit = () => {
    setApplied(false);
    put.reset();
  };
  const check = (event: FormEvent) => {
    event.preventDefault();
    if (body === null) return;
    const key = bodyKey;
    put.mutate({ ...body, dryRun: true }, { onSuccess: (result) => setChecked({ key, diff: result.diff }) });
  };
  const apply = () => {
    if (body === null) return;
    put.mutate(
      { ...body, dryRun: false },
      {
        onSuccess: (result) => {
          queryClient.setQueryData(settingsQuery.queryKey, result.settings);
          setFields(fieldValues(result.settings));
          setYaml(result.settings.yaml);
          setChecked(null);
          setConfirming(false);
          setApplied(true);
        },
      },
    );
  };

  const error = put.error instanceof ApiError ? put.error : null;
  const errorText =
    put.error === null
      ? null
      : error?.field !== undefined
        ? fill(t("settings.errorField"), { error: errorMessage(error), field: error.field })
        : errorMessage(put.error);
  // A refused typed field shows the refusal on the field itself.
  const onField = (name: FieldName) =>
    numberErrors[name] ?? (mode === "fields" && error?.field === name ? (errorText ?? undefined) : undefined);
  const placedOnField = mode === "fields" && error?.field !== undefined && error.field in fields;
  const diff = checked?.key === bodyKey ? checked.diff : null;

  return (
    <form className={styles.form} onSubmit={check} noValidate>
      <Tabs
        label={t("settings.editAs")}
        value={mode}
        onChange={(id) => {
          setMode(id as typeof mode);
          edit();
        }}
        items={[
          {
            id: "fields",
            label: t("settings.fields"),
            content: (
              <div className={styles.fieldGrid}>
                <TextField
                  label={t("settings.proxyURL")}
                  hint={t("settings.proxyURLHint")}
                  value={fields.proxyURL}
                  mono
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    edit();
                    setFields({ ...fields, proxyURL: event.target.value });
                  }}
                  error={onField("proxyURL")}
                />
                <TextField
                  label={t("settings.requestRetry")}
                  hint={t("settings.requestRetryHint")}
                  inputMode="numeric"
                  value={fields.requestRetry}
                  onChange={(event) => {
                    edit();
                    setFields({ ...fields, requestRetry: event.target.value });
                  }}
                  error={onField("requestRetry")}
                />
                <TextField
                  label={t("settings.maxRetryInterval")}
                  hint={t("settings.maxRetryIntervalHint")}
                  inputMode="numeric"
                  value={fields.maxRetryInterval}
                  onChange={(event) => {
                    edit();
                    setFields({ ...fields, maxRetryInterval: event.target.value });
                  }}
                  error={onField("maxRetryInterval")}
                />
              </div>
            ),
          },
          {
            id: "yaml",
            label: t("settings.yaml"),
            content: (
              <YamlEditor
                value={yaml}
                onChange={(value) => {
                  edit();
                  setYaml(value);
                }}
              />
            ),
          },
        ]}
      />
      <p className={styles.dim}>{t("settings.checkHint")}</p>
      <div className={styles.actions}>
        <Button type="submit" busy={put.isPending && !confirming} disabled={body === null}>
          {t("settings.check")}
        </Button>
        <Button variant="primary" disabled={diff === null || diff === ""} onClick={() => setConfirming(true)}>
          {t("settings.apply")}
        </Button>
      </div>
      {errorText !== null && !confirming && !placedOnField && <p role="alert">{errorText}</p>}
      <p role="status" className={styles.dim}>
        {applied ? t("settings.applied") : ""}
      </p>
      {diff !== null && (
        <section aria-label={t("settings.diff")}>
          <h3>{t("settings.diff")}</h3>
          {diff === "" ? <p>{t("settings.noChanges")}</p> : <DiffView text={diff} />}
        </section>
      )}
      {confirming && diff !== null && (
        <ConfirmDialog
          title={t("settings.applyTitle")}
          body={
            <>
              <p>{t("settings.applyBody")}</p>
              <DiffView text={diff} />
            </>
          }
          confirmLabel={t("settings.applyConfirm")}
          variant="primary"
          busy={put.isPending}
          error={errorText}
          onConfirm={apply}
          onClose={() => {
            setConfirming(false);
            put.reset();
          }}
        />
      )}
    </form>
  );
}

function YamlEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className={styles.yaml}>
      <div className={styles.yamlHead}>
        <label htmlFor={id} className={styles.label}>
          {t("settings.yamlLabel")}
        </label>
        <CopyButton value={value} />
      </div>
      <CodeEditor id={id} value={value} describedBy={`${id}-hint`} onChange={onChange} />
      <p id={`${id}-hint`} className={styles.dim}>
        {t("settings.yamlHint")}
      </p>
      <p className={styles.dim}>
        <a href="https://help.router-for.me/configuration/basic" target="_blank" rel="noreferrer">
          {t("settings.yamlDocs")}
        </a>
      </p>
    </div>
  );
}
