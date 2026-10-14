import { describe, expect, it } from "vitest";
import { proxyChanged, proxyDraft, proxyInput, proxyParts } from "./proxy";

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
});

describe("proxyParts", () => {
  it("split an address into its upper-cased scheme and host:port", () => {
    expect(proxyParts("socks5h://proxy.example.com:1080")).toEqual({ scheme: "SOCKS5H", host: "proxy.example.com:1080" });
    expect(proxyParts("nonsense")).toBeNull();
  });
});
