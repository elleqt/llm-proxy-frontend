import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import type { AccountProxy } from "./proxy";
import { ProxyCell } from "./ProxyCell";

const cell = (proxy: AccountProxy) =>
  render(
    <I18nProvider>
      <ProxyCell proxy={proxy} />
    </I18nProvider>,
  );

const own: AccountProxy = { mode: "custom", url: "socks5://proxy.example.com:1080", hasCredentials: true };

describe("ProxyCell", () => {
  afterEach(() => {
    // Back to jsdom's own (zero) sizes.
    delete (HTMLSpanElement.prototype as Partial<Record<"scrollWidth" | "clientWidth", number>>).scrollWidth;
    delete (HTMLSpanElement.prototype as Partial<Record<"scrollWidth" | "clientWidth", number>>).clientWidth;
  });

  it("names the inherited and the direct modes", () => {
    cell({ mode: "inherit" });
    expect(screen.getByText(en["proxy.inherit"])).toBeInTheDocument();
    cell({ mode: "direct" });
    expect(screen.getByText(en["proxy.direct"])).toBeInTheDocument();
  });

  it("shows an own proxy as its scheme, host and a lock for credentials", () => {
    cell(own);
    expect(screen.getByText("SOCKS5")).toBeInTheDocument();
    expect(screen.getByText("proxy.example.com:1080")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: en["proxy.withCredentials"] })).toBeInTheDocument();
  });

  it("shows no lock without credentials", () => {
    cell({ ...own, hasCredentials: false });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("says when an own proxy's address cannot be read", () => {
    cell({ mode: "custom" });
    expect(screen.getByText(en["proxy.unreadable"])).toBeInTheDocument();
  });

  it("makes an overflowing line focusable, named by the full address", () => {
    Object.defineProperty(HTMLSpanElement.prototype, "scrollWidth", { configurable: true, get: () => 300 });
    Object.defineProperty(HTMLSpanElement.prototype, "clientWidth", { configurable: true, get: () => 100 });
    cell(own);
    const line = screen.getByLabelText(`socks5://proxy.example.com:1080, ${en["proxy.withCredentials"]}`);
    expect(line).toHaveAttribute("tabIndex", "0");
  });

  it("leaves a line that fits out of the tab order", () => {
    cell(own);
    const line = screen.getByText("SOCKS5").parentElement;
    expect(line).not.toHaveAttribute("tabIndex");
    expect(line).not.toHaveAttribute("aria-label");
  });
});
