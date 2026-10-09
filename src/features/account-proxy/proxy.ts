import type { components } from "../../shared/api/schema";
import type { MessageKey } from "../../shared/i18n";

export type AccountProxy = components["schemas"]["AccountProxy"];
export type AccountProxyInput = components["schemas"]["AccountProxyInput"];
export type ProxyMode = AccountProxyInput["mode"];

/** The proxy part of a form: the chosen mode and a URL typed for an own proxy. */
export interface ProxyDraft {
  mode: ProxyMode;
  url: string;
}

export const PROXY_MODES = ["inherit", "direct", "custom"] as const satisfies readonly ProxyMode[];

/** A form's starting point: the stored mode, and no URL — a stored one is never sent back to the browser. */
export function proxyDraft(stored: AccountProxy | undefined): ProxyDraft {
  return { mode: stored?.mode ?? "inherit", url: "" };
}

/** Whether the draft asks for anything the stored proxy is not. An empty URL keeps a stored own proxy. */
export function proxyChanged(draft: ProxyDraft, stored: AccountProxy | undefined): boolean {
  return draft.mode !== (stored?.mode ?? "inherit") || draft.url.trim() !== "";
}

/** The request body for a draft: only an own proxy carries a URL. */
export function proxyInput(draft: ProxyDraft): AccountProxyInput {
  return draft.mode === "custom" ? { mode: "custom", url: draft.url.trim() } : { mode: draft.mode };
}

/** How the table names an account's proxy. */
export function proxyLabel(proxy: AccountProxy, t: (key: MessageKey) => string): string {
  if (proxy.mode === "inherit") return t("proxy.inherit");
  if (proxy.mode === "direct") return t("proxy.direct");
  if (proxy.url === undefined) return t("proxy.unreadable");
  return proxy.hasCredentials ? `${proxy.url} · ${t("proxy.withCredentials")}` : proxy.url;
}
