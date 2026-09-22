import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { tokensQuery, type Token } from "../../entities/token/tokens";
import { PERIODS, usageQuery, usageSeries, type ModelUsage, type Period } from "../../entities/usage/usage";
import { IssueToken } from "../../features/issue-token/IssueToken";
import { RevokeToken } from "../../features/revoke-token/RevokeToken";
import { useErrorMessage, useLang, useT } from "../../shared/i18n";
import { Badge, Button, Card, Chart, EmptyState, Spinner, Table, type Column } from "../../shared/ui";
import styles from "./CabinetPage.module.css";

export function CabinetPage() {
  const t = useT();
  return (
    <>
      <h1>{t("page.cabinet.title")}</h1>
      <div className={styles.sections}>
        <Tokens />
        <UsageSection />
      </div>
    </>
  );
}

function Tokens() {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const tokens = useQuery(tokensQuery);
  const listRef = useRef<HTMLDivElement>(null);
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  const columns: Column<Token>[] = [
    { id: "label", header: t("tokens.label"), cell: (token) => token.label },
    { id: "prefix", header: t("tokens.prefix"), mono: true, cell: (token) => <span className={styles.nowrap}>{token.prefix}…</span> },
    { id: "created", header: t("tokens.created"), cell: (token) => dateTime.format(new Date(token.createdAt)) },
    {
      id: "lastUsed",
      header: t("tokens.lastUsed"),
      cell: (token) =>
        token.lastUsedAt == null ? (
          <span className={styles.never}>{t("tokens.neverUsed")}</span>
        ) : (
          dateTime.format(new Date(token.lastUsedAt))
        ),
    },
    {
      id: "state",
      header: t("tokens.state"),
      cell: (token) =>
        token.revokedAt == null ? (
          <Badge tone="accent">{t("tokens.active")}</Badge>
        ) : (
          <Badge tone="muted">{t("tokens.revoked")}</Badge>
        ),
    },
    {
      id: "actions",
      header: <span className={styles.visuallyHidden}>{t("tokens.actions")}</span>,
      align: "end",
      cell: (token) => (token.revokedAt == null ? <RevokeToken token={token} returnFocus={listRef} /> : null),
    },
  ];

  return (
    <Card title={t("tokens.title")} actions={<IssueToken />}>
      {tokens.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : tokens.isError ? (
        <p role="alert">{errorMessage(tokens.error)}</p>
      ) : tokens.data.length === 0 ? (
        <EmptyState title={t("tokens.empty")} body={t("tokens.emptyBody")} />
      ) : (
        <div ref={listRef} tabIndex={-1}>
          <Table label={t("page.cabinet.title")} columns={columns} rows={tokens.data} rowKey={(token) => token.id} />
        </div>
      )}
    </Card>
  );
}

function UsageSection() {
  const t = useT();
  const [period, setPeriod] = useState<Period>("24h");
  return (
    <Card
      title={t("usage.title")}
      actions={
        <div role="group" aria-label={t("usage.period")} className={styles.periods}>
          {PERIODS.map((value) => (
            <Button
              key={value}
              aria-pressed={value === period}
              className={styles.period}
              onClick={() => setPeriod(value)}
            >
              {t(`usage.period.${value}`)}
            </Button>
          ))}
        </div>
      }
    >
      <UsageBody period={period} />
    </Card>
  );
}

function UsageBody({ period }: { period: Period }) {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const usage = useQuery(usageQuery(period));
  // Memoised: the chart rebuilds whenever its data or series change identity.
  const series = useMemo(() => (usage.data === undefined ? null : usageSeries(usage.data)), [usage.data]);
  const chartSeries = useMemo(() => series?.models.map((model) => ({ label: model.model })) ?? [], [series]);

  if (usage.isPending) return <Spinner label={t("app.loading")} />;
  if (usage.isError) return <p role="alert">{errorMessage(usage.error)}</p>;
  if (series === null || series.models.length === 0) return <EmptyState title={t("usage.empty")} />;

  const number = new Intl.NumberFormat(lang);
  const columns: Column<ModelUsage>[] = [
    { id: "model", header: t("usage.model"), mono: true, cell: (row) => row.model },
    { id: "requests", header: t("usage.requests"), align: "end", cell: (row) => number.format(row.requests) },
    { id: "tokens", header: t("usage.tokens"), align: "end", cell: (row) => number.format(row.tokensTotal) },
  ];
  return (
    <>
      <dl className={styles.totals}>
        <div>
          <dt>{t("usage.requests")}</dt>
          <dd>{number.format(usage.data.totals.requests)}</dd>
        </div>
        <div>
          <dt>{t("usage.tokens")}</dt>
          <dd>{number.format(usage.data.totals.tokensTotal)}</dd>
        </div>
      </dl>
      <Chart label={t("usage.chart")} data={series.data} series={chartSeries} />
      <Table label={t("usage.byModel")} columns={columns} rows={series.models} rowKey={(row) => row.model} />
    </>
  );
}
