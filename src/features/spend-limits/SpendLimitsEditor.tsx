import { useState, type FormEvent } from "react";
import type { SpendLimit } from "../../entities/limits/limits";
import { ApiError } from "../../shared/api/client";
import { useErrorMessage, useLang, useT, type MessageKey } from "../../shared/i18n";
import { parseDecimal } from "../../shared/lib/decimal";
import { fill } from "../../shared/lib/template";
import { Button, Select, TextField } from "../../shared/ui";
import { UNIT_MINUTES, unitLabel, windowParts, type WindowUnit } from "./format";
import styles from "./SpendLimitsEditor.module.css";

/** The server's rules: at most 10 limits, windows of 1 minute to 365 days, amounts above 0 up to a million. */
const MAX_LIMITS = 10;
const MAX_WINDOW_MINUTES = 525_600;
const MAX_AMOUNT_USD = 1_000_000;

const UNITS = ["minutes", "hours", "days"] as const satisfies readonly WindowUnit[];

/** A limit as typed: text until saved, so a half-typed number is not lost. */
interface Row {
  key: number;
  count: string;
  unit: WindowUnit;
  amount: string;
}

type Field = "window" | "amount";
// Keys, not text: translated at render, so they follow a language switch.
type RowErrors = Partial<Record<Field, MessageKey>>;

let nextRowKey = 0;

function toRows(value: readonly SpendLimit[], lang: string): Row[] {
  const number = new Intl.NumberFormat(lang, { useGrouping: false, maximumFractionDigits: 20 });
  return value.map((limit) => {
    const { count, unit } = windowParts(limit.windowMinutes);
    return { key: nextRowKey++, count: String(count), unit, amount: number.format(limit.amountUsd) };
  });
}

/** The limits the rows stand for, or, keyed by row, what keeps them from being saved. */
function check(rows: readonly Row[]): { limits: SpendLimit[]; errors: Record<number, RowErrors> } {
  const limits: SpendLimit[] = [];
  const errors: Record<number, RowErrors> = {};
  const seen = new Set<number>();
  for (const row of rows) {
    const found: RowErrors = {};
    const count = row.count.trim();
    const windowMinutes = /^\d+$/.test(count) ? Number(count) * UNIT_MINUTES[row.unit] : NaN;
    if (!(windowMinutes >= 1 && windowMinutes <= MAX_WINDOW_MINUTES)) found.window = "limits.windowInvalid";
    else if (seen.has(windowMinutes)) found.window = "limits.duplicate";
    else seen.add(windowMinutes);
    const amountUsd = parseDecimal(row.amount);
    if (amountUsd === undefined || amountUsd <= 0 || amountUsd > MAX_AMOUNT_USD) found.amount = "limits.amountInvalid";
    if (found.window !== undefined || found.amount !== undefined) errors[row.key] = found;
    else if (amountUsd !== undefined) limits.push({ windowMinutes, amountUsd });
  }
  return { limits, errors };
}

const REFUSED_FIELDS: Record<string, Field> = { windowMinutes: "window", amountUsd: "amount" };

/**
 * A set of spend limits, each "amount per window". Saves the whole set at
 * once; the caller owns the request, and passes its failure back as `error`.
 * `onEdit` reports each change to the rows: a refusal is about the values
 * that were submitted, so the caller drops it once the user changes them.
 */
export function SpendLimitsEditor({
  value,
  onSave,
  onEdit,
  saving,
  error,
  emptyLabel,
}: {
  value: readonly SpendLimit[];
  onSave: (next: SpendLimit[]) => void;
  onEdit?: () => void;
  saving: boolean;
  error: unknown;
  emptyLabel: string;
}) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const [rows, setRows] = useState(() => toRows(value, lang));
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  // The keys of the rows last sent, in order: a refusal names a row by its position in them.
  const [submitted, setSubmitted] = useState<readonly number[]>([]);
  // A new `value` (the saved set, after a save) replaces whatever is typed.
  const [seeded, setSeeded] = useState(value);
  if (seeded !== value) {
    setSeeded(value);
    setRows(toRows(value, lang));
    setErrors({});
    setSubmitted([]);
  }

  const change = (next: (current: Row[]) => Row[]) => {
    setRows(next);
    onEdit?.();
  };
  const edit = (key: number, patch: Partial<Row>) =>
    change((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: number) => change((current) => current.filter((row) => row.key !== key));
  const add = () => change((current) => [...current, { key: nextRowKey++, count: "", unit: "hours", amount: "" }]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { limits, errors: found } = check(rows);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitted(rows.map((row) => row.key));
    onSave(limits);
  };

  // A refusal naming a submitted row's field (`[n].amountUsd`) lands on that field while the row
  // is still here; any other shows for the form.
  const refused = error instanceof ApiError ? error.field?.match(/^\[(\d+)\]\.(windowMinutes|amountUsd)$/) : null;
  const refusedKey = refused == null ? undefined : submitted[Number(refused[1])];
  const refusedField = refused == null ? undefined : REFUSED_FIELDS[refused[2] ?? ""];
  const refusalShown = refusedKey !== undefined && rows.some((row) => row.key === refusedKey);
  const fieldError = (row: Row, field: Field) => {
    const own = errors[row.key]?.[field];
    if (own !== undefined) return t(own);
    return row.key === refusedKey && field === refusedField ? errorMessage(error) : undefined;
  };

  return (
    <form className={styles.editor} onSubmit={submit} noValidate>
      {rows.length === 0 && <p className={styles.dim}>{emptyLabel}</p>}
      {rows.map((row, index) => {
        const count = row.count.trim();
        // An unreadable count takes the form of 0: "minutes", "минут".
        const unitCount = /^\d+$/.test(count) ? Number(count) : 0;
        const unitOptions = UNITS.map((unit) => ({ value: unit, label: unitLabel(unit, unitCount, t, lang) }));
        return (
          <fieldset key={row.key} className={styles.row}>
            <legend className={styles.visuallyHidden}>{fill(t("limits.row"), { n: index + 1 })}</legend>
            <TextField
              label={t("limits.windowCount")}
              value={row.count}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => edit(row.key, { count: event.target.value })}
              error={fieldError(row, "window")}
            />
            <Select
              label={t("limits.windowUnit")}
              options={unitOptions}
              value={row.unit}
              onChange={(event) => edit(row.key, { unit: event.target.value as WindowUnit })}
            />
            <TextField
              label={t("limits.amount")}
              value={row.amount}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => edit(row.key, { amount: event.target.value })}
              error={fieldError(row, "amount")}
            />
            <Button className={styles.remove} onClick={() => remove(row.key)}>
              {t("limits.remove")}
            </Button>
          </fieldset>
        );
      })}
      {error != null && !refusalShown && <p role="alert">{errorMessage(error)}</p>}
      <div className={styles.actions}>
        <Button onClick={add} disabled={rows.length >= MAX_LIMITS}>
          {t("limits.add")}
        </Button>
        <Button type="submit" variant="primary" busy={saving}>
          {t("limits.save")}
        </Button>
      </div>
    </form>
  );
}
