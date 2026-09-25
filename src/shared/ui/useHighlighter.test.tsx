import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { CodeEditor } from "./CodeEditor";
import { DiffView } from "./DiffView";

vi.mock("../lib/highlight", () => {
  throw new Error("the chunk is gone");
});

describe("useHighlighter", () => {
  it("without Prism, shows the text uncolored, escaped and numbered", async () => {
    const yaml = 'note: "<img src=x onerror=alert(1)> & more"\nrequest-retry: 3';
    const diff = "-note: <b>\n+note: a & b\n";
    const { container } = render(
      <I18nProvider>
        <CodeEditor id="config" value={yaml} describedBy="config-hint" onChange={() => {}} />
        <DiffView text={diff} />
      </I18nProvider>,
    );
    await act(() => import("../lib/highlight").catch(() => {}));

    const [editor, diffView] = container.querySelectorAll("pre");
    expect([...(editor?.children ?? [])].map((line) => line.firstElementChild?.textContent)).toEqual(["1", "2"]);
    expect(editor?.children[0]).toHaveTextContent('note: "<img src=x onerror=alert(1)> & more"');
    expect(diffView?.textContent).toBe(diff);
    expect(container.querySelector("img, b, .token")).toBeNull();
  });
});
