import { queryOptions } from "@tanstack/react-query";
import type uPlot from "uplot";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Usage = components["schemas"]["Usage"];

export const PERIODS = ["24h", "7d", "30d"] as const;
export type Period = (typeof PERIODS)[number];

const HOUR_MS = 3_600_000;
const PERIOD_MS: Record<Period, number> = { "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS, "30d": 30 * 24 * HOUR_MS };

/** The caller's usage over the last `period`, ending now (taken when the query runs, not in its key). */
export function usageQuery(period: Period) {
  return queryOptions({
    queryKey: ["usage", period],
    queryFn: ({ signal }) => {
      const to = new Date();
      const from = new Date(to.getTime() - PERIOD_MS[period]);
      return unwrap(
        client.GET("/api/me/usage", { params: { query: { from: from.toISOString(), to: to.toISOString() } }, signal }),
      );
    },
  });
}

export interface ModelUsage {
  model: string;
  requests: number;
  tokensTotal: number;
  costUSD: number;
}

export interface UsageSeries {
  /** Models by total tokens, most used first; one chart series each. */
  models: ModelUsage[];
  /** uPlot's aligned layout: bucket starts in Unix seconds, then tokens per model. */
  tokens: uPlot.AlignedData;
  /** The same layout with each bucket's estimated cost in US dollars. */
  cost: uPlot.AlignedData;
}

/**
 * Lays the backend's aggregated points out for the chart: one line per model
 * over every bucket of the period, a bucket without a point being zero rather
 * than a gap the line would jump across.
 */
export function usageSeries(usage: Usage): UsageSeries {
  const step = usage.bucket === "hour" ? 3600 : 86_400;
  const from = Math.floor(Date.parse(usage.from) / 1000 / step) * step;
  const to = Date.parse(usage.to) / 1000;

  const xs = new Set<number>();
  for (let x = from; x < to; x += step) xs.add(x);

  const perModel = new Map<string, { usage: ModelUsage; tokensAt: Map<number, number>; costAt: Map<number, number> }>();
  for (const point of usage.points) {
    const x = Date.parse(point.at) / 1000;
    xs.add(x);
    let entry = perModel.get(point.model);
    if (entry === undefined) {
      entry = { usage: { model: point.model, requests: 0, tokensTotal: 0, costUSD: 0 }, tokensAt: new Map(), costAt: new Map() };
      perModel.set(point.model, entry);
    }
    entry.usage.requests += point.requests;
    entry.usage.tokensTotal += point.tokensTotal;
    entry.usage.costUSD += point.costUSD;
    entry.tokensAt.set(x, (entry.tokensAt.get(x) ?? 0) + point.tokensTotal);
    entry.costAt.set(x, (entry.costAt.get(x) ?? 0) + point.costUSD);
  }

  const sortedXs = [...xs].sort((a, b) => a - b);
  const entries = [...perModel.values()].sort((a, b) => b.usage.tokensTotal - a.usage.tokensTotal);
  return {
    models: entries.map((entry) => entry.usage),
    tokens: [sortedXs, ...entries.map((entry) => sortedXs.map((x) => entry.tokensAt.get(x) ?? 0))],
    cost: [sortedXs, ...entries.map((entry) => sortedXs.map((x) => entry.costAt.get(x) ?? 0))],
  };
}
