import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useT } from "../i18n";
import styles from "./Chart.module.css";

export interface ChartSeries {
  label: string;
}

export interface ChartProps {
  /** Accessible name: what the chart shows. */
  label: string;
  /**
   * Already aggregated by the backend, uPlot's aligned layout:
   * `[xs, ...ys]`, xs in Unix seconds, one ys array per entry of `series`.
   */
  data: uPlot.AlignedData;
  series: readonly ChartSeries[];
  height?: number;
}

const TOKENS = ["--fg", "--dim", "--line", "--accent"] as const;
type Palette = Record<(typeof TOKENS)[number], string>;

/**
 * The theme's colours as one string, so the snapshot compares by value.
 * Changes when <html data-theme> changes, and when the OS scheme flips
 * (which is what `auto` follows).
 */
function readPalette(): string {
  const style = getComputedStyle(document.documentElement);
  return TOKENS.map((token) => style.getPropertyValue(token).trim()).join("|");
}

function subscribePalette(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    scheme.removeEventListener("change", onChange);
  };
}

function parsePalette(key: string): Palette {
  const [fg = "", dim = "", line = "", accent = ""] = key.split("|");
  return { "--fg": fg, "--dim": dim, "--line": line, "--accent": accent };
}

const FONT = "12px system-ui, sans-serif";
// Seven tokens give three usable line colours; dashes tell further series apart.
const DASHES: number[][] = [[], [6, 4], [2, 3]];

function options(palette: Palette, labels: readonly string[], width: number, height: number): uPlot.Options {
  const lineColors = [palette["--accent"], palette["--fg"], palette["--dim"]];
  const axis: uPlot.Axis = {
    stroke: palette["--dim"],
    font: FONT,
    grid: { stroke: palette["--line"], width: 1 },
    ticks: { stroke: palette["--line"], width: 1 },
  };
  return {
    width,
    height,
    series: [
      {},
      ...labels.map((label, i) => ({
        label,
        stroke: lineColors[i % lineColors.length] ?? palette["--accent"],
        dash: DASHES[Math.floor(i / lineColors.length) % DASHES.length] ?? [],
        width: 2,
        points: { show: false },
      })),
    ],
    axes: [axis, axis],
    cursor: { points: { show: false } },
  };
}

/**
 * A thin uPlot wrapper. It draws what it is given and computes nothing. uPlot
 * is loaded on first use, keeping it out of the bundle for pages without charts.
 *
 * New `data` is handed to the existing plot. The plot is rebuilt only when
 * what it looks like changes: the series labels, the height or the theme — so
 * a caller may pass a fresh `series` array on every render.
 */
export function Chart({ label, data, series, height = 240 }: ChartProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef(data);
  const [failed, setFailed] = useState(false);
  const palette = useSyncExternalStore(subscribePalette, readPalette);
  const labels = JSON.stringify(series.map((s) => s.label));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let resize: ResizeObserver | null = null;
    void import("uplot").then(
      ({ default: UPlot }) => {
        if (cancelled) return;
        let width = container.clientWidth;
        const plot = new UPlot(
          options(parsePalette(palette), JSON.parse(labels) as string[], width, height),
          dataRef.current,
          container,
        );
        plotRef.current = plot;
        resize = new ResizeObserver(() => {
          if (container.clientWidth === width) return;
          width = container.clientWidth;
          plot.setSize({ width, height });
        });
        resize.observe(container);
      },
      // The chunk is gone, e.g. a tab opened before a redeploy.
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      resize?.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [palette, labels, height]);

  useEffect(() => {
    dataRef.current = data;
    plotRef.current?.setData(data);
  }, [data]);

  if (failed) return <p className={styles.failed}>{t("ui.chartFailed")}</p>;
  return <div ref={containerRef} role="img" aria-label={label} className={styles.chart} style={{ minHeight: height }} />;
}
