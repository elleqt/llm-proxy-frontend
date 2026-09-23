import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type uPlot from "uplot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useLang } from "../i18n";
import { en } from "../i18n/en";
import { ru } from "../i18n/ru";
import { Chart, type ChartSeries } from "./Chart";

// jsdom has no canvas, so uPlot itself cannot run here. A stand-in records
// what the chart is asked to draw; the theme stylesheet supplies the colours
// through the same custom properties the app uses.
interface PlotRecord {
  opts: uPlot.Options;
  data: uPlot.AlignedData | undefined;
  destroyed: boolean;
}
const plots = vi.hoisted(() => [] as PlotRecord[]);

vi.mock("uplot", () => ({
  default: class {
    readonly record: PlotRecord;
    constructor(opts: uPlot.Options, data?: uPlot.AlignedData) {
      this.record = { opts, data, destroyed: false };
      plots.push(this.record);
    }
    setData(data: uPlot.AlignedData) {
      this.record.data = data;
    }
    setSize() {}
    destroy() {
      this.record.destroyed = true;
    }
  },
}));

const THEMES = `
  :root, html[data-theme="light"] { --fg: #1b1f24; --dim: #5c636b; --line: #dfe3e8; --accent: #2f5fd0; }
  html[data-theme="dark"] { --fg: #d7dbdf; --dim: #8b949e; --line: #262b30; --accent: #7aa2f7; }
`;

let style: HTMLStyleElement;

beforeEach(() => {
  plots.length = 0;
  style = document.createElement("style");
  style.textContent = THEMES;
  document.head.append(style);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  style.remove();
  vi.unstubAllGlobals();
});

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

function chart(data: uPlot.AlignedData, series: ChartSeries[]) {
  return <Chart label="Requests per hour" data={data} series={series} />;
}

describe("Chart", () => {
  it("redraws in the new theme's colours when the theme changes", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(chart([[0, 3600], [4, 7]], [{ label: "Requests" }]), { wrapper });

    expect(screen.getByRole("img", { name: "Requests per hour" })).toBeInTheDocument();
    await waitFor(() => expect(plots).toHaveLength(1));
    expect(plots[0]!.opts.series[1]?.stroke).toBe("#2f5fd0");

    document.documentElement.setAttribute("data-theme", "dark");

    await waitFor(() => expect(plots).toHaveLength(2));
    expect(plots[0]!.destroyed).toBe(true);
    expect(plots[1]!.opts.series[1]?.stroke).toBe("#7aa2f7");
    expect(plots[1]!.opts.axes?.[0]?.grid?.stroke).toBe("#262b30");
  });

  it("hands new data to the same plot and rebuilds only when the series change", async () => {
    const { rerender } = render(chart([[0], [1]], [{ label: "Requests" }]), { wrapper });
    await waitFor(() => expect(plots).toHaveLength(1));

    // A fresh but equal series array, as a caller mapping query data passes.
    rerender(chart([[0, 3600], [1, 2]], [{ label: "Requests" }]));

    expect(plots).toHaveLength(1);
    expect(plots[0]!.data).toEqual([[0, 3600], [1, 2]]);

    rerender(chart([[0, 3600], [1, 2], [5, 6]], [{ label: "Requests" }, { label: "Tokens" }]));

    await waitFor(() => expect(plots).toHaveLength(2));
    expect(plots[0]!.destroyed).toBe(true);
    expect(plots[1]!.opts.series.map((s) => s.label)).toEqual([en["ui.chartTime"], "Requests", "Tokens"]);
    expect(plots[1]!.data).toEqual([[0, 3600], [1, 2], [5, 6]]);
  });

  it("speaks the interface language in its legend and numbers, and follows a switch", async () => {
    function Page() {
      const [, setLang] = useLang();
      return (
        <>
          <button type="button" onClick={() => setLang("ru")}>
            RU
          </button>
          {chart([[0], [1234.5]], [{ label: "Requests" }])}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Page />, { wrapper });
    await waitFor(() => expect(plots).toHaveLength(1));
    const legendValue = (plot: PlotRecord, v: number) =>
      (plot.opts.series[1]?.value as (self: uPlot, v: number, s: number, i: number) => string)({} as uPlot, v, 1, 0);
    expect(plots[0]!.opts.series[0]?.label).toBe(en["ui.chartTime"]);
    expect(legendValue(plots[0]!, 1234.5)).toBe("1,234.5");

    await user.click(screen.getByRole("button", { name: "RU" }));

    await waitFor(() => expect(plots).toHaveLength(2));
    expect(plots[1]!.opts.series[0]?.label).toBe(ru["ui.chartTime"]);
    expect(legendValue(plots[1]!, 1234.5)).toMatch(/^1\s234,5$/);
  });
});
