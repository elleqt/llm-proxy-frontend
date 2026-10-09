import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { proxyChanged, proxyDraft, proxyInput, proxyLabel } from "./proxy";

const t = (key: keyof typeof en) => en[key];

describe("proxy drafts", () => {
  it("start from the stored mode with no URL, and change only when the mode or a typed URL does", () => {
    const stored = { mode: "custom" as const, url: "http://proxy.example.com:3128", hasCredentials: true };
    const draft = proxyDraft(stored);
    expect(draft).toEqual({ mode: "custom", url: "" });
    expect(proxyChanged(draft, stored)).toBe(false);
    expect(proxyChanged({ mode: "custom", url: "http://other.example.com" }, stored)).toBe(true);
    expect(proxyChanged({ mode: "direct", url: "" }, stored)).toBe(true);
    expect(proxyDraft(undefined)).toEqual({ mode: "inherit", url: "" });
  });

  it("send a URL only for an own proxy", () => {
    expect(proxyInput({ mode: "custom", url: " http://p.example.com " })).toEqual({ mode: "custom", url: "http://p.example.com" });
    expect(proxyInput({ mode: "direct", url: "http://p.example.com" })).toEqual({ mode: "direct" });
  });

  it("label each mode, an own proxy by its address", () => {
    expect(proxyLabel({ mode: "inherit" }, t)).toBe(en["proxy.inherit"]);
    expect(proxyLabel({ mode: "direct" }, t)).toBe(en["proxy.direct"]);
    expect(proxyLabel({ mode: "custom", url: "http://p.example.com:3128", hasCredentials: true }, t)).toBe(
      `http://p.example.com:3128 · ${en["proxy.withCredentials"]}`,
    );
    expect(proxyLabel({ mode: "custom" }, t)).toBe(en["proxy.unreadable"]);
  });
});
