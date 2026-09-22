import { useEffect, useRef, useSyncExternalStore } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
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

function options(palette: Palette, series: readonly ChartSeries[], width: number, height: number): uPlot.Options {
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
      ...series.map((s, i) => ({
        label: s.label,
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
 */
export function Chart({ label, data, series, height = 240 }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef(data);
  const palette = useSyncExternalStore(subscribePalette, readPalette);

  // (Re)build on anything that changes the options: colours, series, size.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let resize: ResizeObserver | null = null;
    void import("uplot").then(({ default: UPlot }) => {
      if (cancelled) return;
      const plot = new UPlot(options(parsePalette(palette), series, container.clientWidth, height), dataRef.current, container);
      plotRef.current = plot;
      resize = new ResizeObserver(() => plot.setSize({ width: container.clientWidth, height }));
      resize.observe(container);
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [palette, series, height]);

  useEffect(() => {
    dataRef.current = data;
    plotRef.current?.setData(data);
  }, [data]);

  return <div ref={containerRef} role="img" aria-label={label} className={styles.chart} />;
}
