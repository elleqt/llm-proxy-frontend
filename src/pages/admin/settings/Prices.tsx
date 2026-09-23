import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import {
  pricesQuery,
  type ModelPrice,
  type PriceCatalog,
  type PriceEntry,
  type PriceList,
} from "../../../entities/settings/settings";
import { ApiError, client, unwrap } from "../../../shared/api/client";
import { useErrorMessage, useLang, useT, type MessageKey } from "../../../shared/i18n";
import { fill } from "../../../shared/lib/template";
import { Badge, Button, Card, EmptyState, Modal, Spinner, Table, TextField, type Column } from "../../../shared/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import styles from "../admin.module.css";

const RATES = ["input", "output", "cacheRead", "cacheWrite"] as const;
type Rate = (typeof RATES)[number];

/**
 * A price as typed: a plain decimal of 0 or more, with a point or a comma
 * (as typed in Russian), else `undefined`. No signs, exponents or hex.
 */
function parsePrice(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : undefined;
}

/** "3 hours ago", "in 5 minutes": the largest whole unit. */
function relativeTime(iso: string, lang: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, size] of [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

const rowName = (price: Pick<ModelPrice, "provider" | "model">) => `${price.provider}:${price.model}`;

/** The administrator's overrides as the PUT body wants them: the whole manual list. */
function manualPrices(list: PriceList): ModelPrice[] {
  return list.prices
    .filter((price) => price.source === "manual")
    .map(({ provider, model, input, output, cacheRead, cacheWrite }) => ({
      provider,
      model,
      input,
      output,
      cacheRead,
      cacheWrite,
    }));
}

/** Replaces the manual override list; the answer is the new list in force. */
function useReplaceOverrides() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ModelPrice[]) => unwrap(client.PUT("/api/admin/prices", { body })),
    onSuccess: (list) => queryClient.setQueryData(pricesQuery.queryKey, list),
  });
}

export function Prices() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const prices = useQuery(pricesQuery);
  return (
    <Card
      title={t("prices.title")}
      actions={
        prices.data === undefined ? undefined : (
          <div className={styles.actions}>
            <RefreshCatalog catalog={prices.data.catalog} />
            <PriceEditor list={prices.data} />
          </div>
        )
      }
    >
      <p className={styles.dim}>{t("prices.intro")}</p>
      {prices.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : prices.isError ? (
        <p role="alert">{errorMessage(prices.error)}</p>
      ) : (
        <>
          <CatalogStatus catalog={prices.data.catalog} />
          <PriceTable list={prices.data} />
        </>
      )}
    </Card>
  );
}

function CatalogStatus({ catalog }: { catalog: PriceCatalog }) {
  const t = useT();
  const [lang] = useLang();
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  if (!catalog.enabled) return <p className={styles.catalogStatus}>{t("prices.catalogOff")}</p>;
  const count = new Intl.NumberFormat(lang).format(catalog.models);
  const checked =
    catalog.checkedAt == null
      ? fill(t("prices.catalogNeverChecked"), { count })
      : fill(t("prices.catalogChecked"), { when: relativeTime(catalog.checkedAt, lang), count });
  const changed =
    catalog.changedAt == null
      ? ""
      : ` ${fill(t("prices.catalogChanged"), { when: relativeTime(catalog.changedAt, lang) })}`;
  return (
    <div className={styles.catalogStatus}>
      <p title={catalog.checkedAt == null ? undefined : dateTime.format(new Date(catalog.checkedAt))}>
        {checked}
        {changed}
      </p>
      {catalog.lastError != null && (
        <p className={styles.error}>{fill(t("prices.catalogError"), { error: catalog.lastError })}</p>
      )}
    </div>
  );
}

function RefreshCatalog({ catalog }: { catalog: PriceCatalog }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => unwrap(client.POST("/api/admin/prices/refresh")),
    onSuccess: (list) => queryClient.setQueryData(pricesQuery.queryKey, list),
    // The catalog was turned off since this view loaded: reload to show that.
    onError: (error) => {
      if (error instanceof ApiError && error.code === "catalog_disabled") {
        void queryClient.invalidateQueries({ queryKey: pricesQuery.queryKey });
      }
    },
  });
  return (
    <>
      <Button busy={refresh.isPending} disabled={!catalog.enabled} onClick={() => refresh.mutate()}>
        {t("prices.refresh")}
      </Button>
      {refresh.isError && (
        <p role="alert" className={styles.error}>
          {errorMessage(refresh.error)}
        </p>
      )}
    </>
  );
}

function PriceTable({ list }: { list: PriceList }) {
  const t = useT();
  // Where focus goes once a reset or deleted row's buttons are gone.
  const listRef = useRef<HTMLDivElement>(null);
  const [lang] = useLang();
  const [filter, setFilter] = useState("");
  const number = new Intl.NumberFormat(lang, { useGrouping: false, maximumFractionDigits: 20 });
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  const needle = filter.trim().toLocaleLowerCase(lang);
  const shown =
    needle === ""
      ? list.prices
      : list.prices.filter((price) => rowName(price).toLocaleLowerCase(lang).includes(needle));

  const rateColumn = (rate: Rate): Column<PriceEntry> => ({
    id: rate,
    header: t(`prices.${rate}`),
    align: "end",
    sortValue: (price) => price[rate],
    cell: (price) => (
      <>
        {/* The column header, repeated where a narrow screen lays the row out as a card. */}
        <span className={styles.rateLabel}>{t(`prices.${rate}`)}</span>
        {number.format(price[rate])}
        {price.catalogRates !== undefined && (
          <span className={styles.catalogRate}>
            {fill(t("prices.catalogValue"), { value: number.format(price.catalogRates[rate]) })}
          </span>
        )}
      </>
    ),
  });
  const columns: Column<PriceEntry>[] = [
    { id: "model", header: t("prices.model"), mono: true, sortValue: rowName, cell: rowName },
    ...RATES.map(rateColumn),
    {
      id: "source",
      header: t("prices.source"),
      sortValue: (price) => price.source,
      cell: (price) => (
        <span className={styles.source}>
          <Badge tone={price.source === "manual" ? "accent" : "neutral"}>{t(`prices.source.${price.source}`)}</Badge>
          <time dateTime={price.updatedAt} className={styles.dim}>
            {dateTime.format(new Date(price.updatedAt))}
          </time>
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className={styles.visuallyHidden}>{t("tokens.actions")}</span>,
      align: "end",
      cell: (price) => (
        <div className={styles.rowActions}>
          <PriceEditor list={list} price={price} />
          {price.source === "manual" && <RemoveOverride list={list} price={price} returnFocus={listRef} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className={styles.priceFilter}>
        <TextField
          label={t("prices.filter")}
          type="search"
          value={filter}
          placeholder={t("prices.filterPlaceholder")}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      {list.prices.length === 0 ? (
        <EmptyState title={t("prices.empty")} />
      ) : shown.length === 0 ? (
        <EmptyState title={t("prices.noMatches")} />
      ) : (
        <div ref={listRef} tabIndex={-1} className={styles.priceTable}>
          <Table label={t("prices.title")} columns={columns} rows={shown} rowKey={rowName} />
        </div>
      )}
    </>
  );
}

/** "Edit" on a row, or "Add price" without one: either saves a manual override. */
function PriceEditor({ list, price }: { list: PriceList; price?: PriceEntry }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      {price === undefined ? (
        <Button variant="primary" onClick={() => setOpen(true)}>
          {t("prices.add")}
        </Button>
      ) : (
        <Button aria-label={fill(t("prices.editLabel"), { row: rowName(price) })} onClick={() => setOpen(true)}>
          {t("prices.edit")}
        </Button>
      )}
      {open && <PriceDialog list={list} price={price} onClose={() => setOpen(false)} />}
    </>
  );
}

type Field = "provider" | "model" | Rate;

function PriceDialog({
  list,
  price,
  onClose,
}: {
  list: PriceList;
  price: PriceEntry | undefined;
  onClose: () => void;
}) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const number = new Intl.NumberFormat(lang, { useGrouping: false, maximumFractionDigits: 20 });
  const [values, setValues] = useState<Record<Field, string>>(() => ({
    provider: price?.provider ?? "",
    model: price?.model ?? "",
    input: price === undefined ? "" : number.format(price.input),
    output: price === undefined ? "" : number.format(price.output),
    cacheRead: price === undefined ? "" : number.format(price.cacheRead),
    cacheWrite: price === undefined ? "" : number.format(price.cacheWrite),
  }));
  // Keys, not text: translated at render, so they follow a language switch.
  const [errors, setErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const save = useReplaceOverrides();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const provider = values.provider.trim();
    const model = values.model.trim();
    const rates = Object.fromEntries(RATES.map((rate) => [rate, parsePrice(values[rate])])) as Record<
      Rate,
      number | undefined
    >;
    const found: Partial<Record<Field, MessageKey>> = {};
    if (provider === "") found.provider = "admin.required";
    if (model === "") found.model = "admin.required";
    for (const rate of RATES) if (rates[rate] === undefined) found[rate] = "prices.rateInvalid";
    setErrors(found);
    const { input, output, cacheRead, cacheWrite } = rates;
    if (Object.keys(found).length > 0 || input === undefined || output === undefined) return;
    if (cacheRead === undefined || cacheWrite === undefined) return;
    // The whole override list, with this row in place of any override for the same model.
    const others = manualPrices(list).filter((other) => rowName(other) !== rowName({ provider, model }));
    save.mutate([...others, { provider, model, input, output, cacheRead, cacheWrite }], { onSuccess: onClose });
  };

  // A refusal naming this row's field (`[n].input`, this row being last) lands on that field.
  const refusal = save.error instanceof ApiError ? save.error : null;
  const ownIndex = manualPrices(list).filter((other) => rowName(other) !== rowName(values)).length;
  const refusedField = refusal?.field?.match(/^\[(\d+)\]\.(\w+)$/);
  const onField =
    refusedField != null &&
    Number(refusedField[1]) === ownIndex &&
    (RATES as readonly string[]).includes(refusedField[2] ?? "")
      ? (refusedField[2] as Rate)
      : null;
  const fieldError = (field: Field) =>
    errors[field] !== undefined ? t(errors[field]) : onField === field ? errorMessage(save.error) : undefined;

  const title = price === undefined ? t("prices.addTitle") : fill(t("prices.editTitle"), { row: rowName(price) });
  return (
    <Modal open onClose={onClose} title={title}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <p className={styles.dim}>{t("prices.manualHint")}</p>
        {price === undefined && (
          <div className={styles.fieldGrid}>
            <TextField
              label={t("prices.provider")}
              value={values.provider}
              mono
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setValues({ ...values, provider: event.target.value })}
              error={fieldError("provider")}
            />
            <TextField
              label={t("prices.model")}
              value={values.model}
              mono
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setValues({ ...values, model: event.target.value })}
              error={fieldError("model")}
            />
          </div>
        )}
        <div className={styles.rateGrid}>
          {RATES.map((rate, index) => (
            <TextField
              key={rate}
              label={t(`prices.${rate}`)}
              value={values[rate]}
              inputMode="decimal"
              autoComplete="off"
              autoFocus={price !== undefined && index === 0}
              hint={
                price?.catalogRates === undefined
                  ? undefined
                  : fill(t("prices.catalogValue"), { value: number.format(price.catalogRates[rate]) })
              }
              onChange={(event) => setValues({ ...values, [rate]: event.target.value })}
              error={fieldError(rate)}
            />
          ))}
        </div>
        {save.isError && onField === null && (
          <p role="alert">
            {refusal?.field !== undefined
              ? fill(t("settings.errorField"), { error: errorMessage(save.error), field: refusal.field })
              : errorMessage(save.error)}
          </p>
        )}
        <div className={styles.dialogActions}>
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" busy={save.isPending}>
            {t("prices.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A manual row's way out: back to the catalog price, or deleted when the catalog has none. */
function RemoveOverride({
  list,
  price,
  returnFocus,
}: {
  list: PriceList;
  price: PriceEntry;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const remove = useReplaceOverrides();
  const row = rowName(price);
  const catalog = price.catalogRates;
  const number = new Intl.NumberFormat(lang, { useGrouping: false, maximumFractionDigits: 20 });
  const kind = catalog === undefined ? "delete" : "reset";
  return (
    <>
      <Button aria-label={fill(t(`prices.${kind}Label`), { row })} onClick={() => setOpen(true)}>
        {t(`prices.${kind}`)}
      </Button>
      {open && (
        <ConfirmDialog
          title={fill(t(`prices.${kind}Title`), { row })}
          body={
            <p>
              {catalog === undefined
                ? t("prices.deleteBody")
                : fill(t("prices.resetBody"), {
                    rates: RATES.map((rate) => `${t(`prices.${rate}`)} ${number.format(catalog[rate])}`).join(" · "),
                  })}
            </p>
          }
          confirmLabel={t(`prices.${kind}Confirm`)}
          busy={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() =>
            remove.mutate(
              manualPrices(list).filter((other) => rowName(other) !== row),
              {
                // Usually the row stops being manual and this button goes, dialog and all,
                // so focus falls back to the list. Close by hand only if the row is still here:
                // closing first would hand focus to a button about to disappear.
                onSuccess: (updated) => {
                  if (updated.prices.some((other) => rowName(other) === row && other.source === "manual"))
                    setOpen(false);
                },
              },
            )
          }
          returnFocus={returnFocus}
          onClose={() => {
            setOpen(false);
            remove.reset();
          }}
        />
      )}
    </>
  );
}
