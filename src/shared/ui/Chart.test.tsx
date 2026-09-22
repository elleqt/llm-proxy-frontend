import { render, screen, waitFor } from "@testing-library/react";
import type uPlot from "uplot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chart } from "./Chart";

// jsdom has no canvas, so uPlot itself cannot run here. A stand-in records
// what the chart is asked to draw with; the real theme stylesheet supplies
// the colours through the same custom properties the app uses.
const plots = vi.hoisted(() => [] as { opts: uPlot.Options; destroyed: boolean }[]);

vi.mock("uplot", () => ({
  default: class {
    readonly record: { opts: uPlot.Options; destroyed: boolean };
    constructor(opts: uPlot.Options) {
      this.record = { opts, destroyed: false };
      plots.push(this.record);
    }
    setData() {}
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

describe("Chart", () => {
  it("redraws in the new theme's colours when the theme changes", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<Chart label="Requests per hour" data={[[0, 3600], [4, 7]]} series={[{ label: "Requests" }]} />);

    expect(screen.getByRole("img", { name: "Requests per hour" })).toBeInTheDocument();
    await waitFor(() => expect(plots).toHaveLength(1));
    expect(plots[0]!.opts.series[1]?.stroke).toBe("#2f5fd0");

    document.documentElement.setAttribute("data-theme", "dark");

    await waitFor(() => expect(plots).toHaveLength(2));
    expect(plots[0]!.destroyed).toBe(true);
    expect(plots[1]!.opts.series[1]?.stroke).toBe("#7aa2f7");
    expect(plots[1]!.opts.axes?.[0]?.grid?.stroke).toBe("#262b30");
  });
});
