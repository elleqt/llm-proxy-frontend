import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import {
  pricesQuery,
  settingsQuery,
  type ModelPrice,
  type Settings,
  type SettingsUpdateRequest,
} from "../../../entities/settings/settings";
import { ApiError, client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useT } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
import { Button, Card, Spinner, Table, Tabs, TextField, type Column } from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
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
          {diff === "" ? <p>{t("settings.noChanges")}</p> : <pre className={styles.diff}>{diff}</pre>}
        </section>
      )}
      {confirming && diff !== null && (
        <ConfirmDialog
          title={t("settings.applyTitle")}
          body={
            <>
              <p>{t("settings.applyBody")}</p>
              <pre className={styles.diff}>{diff}</pre>
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
      <label htmlFor={id} className={styles.label}>
        {t("settings.yamlLabel")}
      </label>
      <textarea
        id={id}
        value={value}
        rows={16}
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        className={styles.textarea}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className={styles.dim}>
        {t("settings.yamlHint")}
      </p>
    </div>
  );
}

interface PriceRow {
  key: number;
  provider: string;
  model: string;
  input: string;
  output: string;
  cacheRead: string;
  cacheWrite: string;
}

const PRICE_FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;
let nextPriceKey = 0;

function toPriceRow(price: ModelPrice): PriceRow {
  return {
    key: nextPriceKey++,
    provider: price.provider,
    model: price.model,
    input: String(price.input),
    output: String(price.output),
    cacheRead: String(price.cacheRead),
    cacheWrite: String(price.cacheWrite),
  };
}

/** A price as typed: a number of 0 or more, else `undefined`. */
function price(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function Prices() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const prices = useQuery(pricesQuery);
  return (
    <Card title={t("prices.title")}>
      <p className={styles.dim}>{t("prices.intro")}</p>
      {prices.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : prices.isError ? (
        <p role="alert">{errorMessage(prices.error)}</p>
      ) : (
        <PriceEditor prices={prices.data} />
      )}
    </Card>
  );
}

function PriceEditor({ prices }: { prices: ModelPrice[] }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState(() => prices.map(toPriceRow));
  const [attempted, setAttempted] = useState(false);
  const save = useMutation({
    mutationFn: (body: ModelPrice[]) => unwrap(client.PUT("/api/admin/prices", { body })),
    onSuccess: (saved) => {
      queryClient.setQueryData(pricesQuery.queryKey, saved);
      setRows(saved.map(toPriceRow));
      setAttempted(false);
    },
  });

  const edit = (key: number, change: Partial<PriceRow>) => {
    save.reset();
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };
  const invalid = (row: PriceRow, field: "provider" | "model" | (typeof PRICE_FIELDS)[number]) =>
    attempted &&
    (field === "provider" || field === "model" ? row[field].trim() === "" : price(row[field]) === undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const parsed: ModelPrice[] = [];
    for (const row of rows) {
      const [input, output, cacheRead, cacheWrite] = PRICE_FIELDS.map((field) => price(row[field]));
      if (row.provider.trim() === "" || row.model.trim() === "") return;
      if (input === undefined || output === undefined || cacheRead === undefined || cacheWrite === undefined) return;
      parsed.push({ provider: row.provider.trim(), model: row.model.trim(), input, output, cacheRead, cacheWrite });
    }
    save.mutate(parsed);
  };

  const cellInput = (row: PriceRow, field: "provider" | "model" | (typeof PRICE_FIELDS)[number], numeric: boolean) => (
    <input
      className={numeric ? `${styles.cellInput} ${styles.number}` : `${styles.cellInput} ${styles.mono}`}
      aria-label={fill(t(`prices.${field}Label`), { row: `${row.provider}:${row.model}` })}
      aria-invalid={invalid(row, field) || undefined}
      inputMode={numeric ? "decimal" : undefined}
      spellCheck={false}
      value={row[field]}
      onChange={(event) => edit(row.key, { [field]: event.target.value })}
    />
  );
  const columns: Column<PriceRow>[] = [
    { id: "provider", header: t("prices.provider"), cell: (row) => cellInput(row, "provider", false) },
    { id: "model", header: t("prices.model"), cell: (row) => cellInput(row, "model", false) },
    ...PRICE_FIELDS.map((field) => ({
      id: field,
      header: t(`prices.${field}`),
      align: "end" as const,
      cell: (row: PriceRow) => cellInput(row, field, true),
    })),
    {
      id: "remove",
      header: <span className={styles.visuallyHidden}>{t("tokens.actions")}</span>,
      align: "end",
      cell: (row) => (
        <Button
          aria-label={fill(t("prices.removeLabel"), { row: `${row.provider}:${row.model}` })}
          onClick={() => {
            save.reset();
            setRows((current) => current.filter((other) => other.key !== row.key));
          }}
        >
          ×
        </Button>
      ),
    },
  ];
  const hasInvalid =
    attempted &&
    rows.some((row) => (["provider", "model", ...PRICE_FIELDS] as const).some((field) => invalid(row, field)));

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {rows.length === 0 ? (
        <p className={styles.dim}>{t("prices.empty")}</p>
      ) : (
        <Table label={t("prices.title")} columns={columns} rows={rows} rowKey={(row) => String(row.key)} />
      )}
      {hasInvalid && <p role="alert">{t("prices.invalid")}</p>}
      {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
      <div className={styles.actions}>
        <Button
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: nextPriceKey++,
                provider: "",
                model: "",
                input: "0",
                output: "0",
                cacheRead: "0",
                cacheWrite: "0",
              },
            ])
          }
        >
          {t("prices.add")}
        </Button>
        <Button type="submit" variant="primary" busy={save.isPending}>
          {t("prices.save")}
        </Button>
      </div>
      <p role="status" className={styles.dim}>
        {save.isSuccess ? t("prices.saved") : ""}
      </p>
    </form>
  );
}
