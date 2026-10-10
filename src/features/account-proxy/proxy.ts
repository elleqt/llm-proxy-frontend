import type { components } from "../../shared/api/schema";

export type AccountProxy = components["schemas"]["AccountProxy"];
export type AccountProxyInput = components["schemas"]["AccountProxyInput"];
type ProxyMode = AccountProxyInput["mode"];

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

/**
 * Whether a drawer's proxy part holds unsaved work: a changed draft, or text
 * typed while Replace is open (even blank, the field is not what was stored).
 */
export function proxyDirty(draft: ProxyDraft & { replacing: boolean }, stored: AccountProxy | undefined): boolean {
  return proxyChanged(draft, stored) || (draft.replacing && draft.url !== "");
}

/** The request body for a draft: only an own proxy carries a URL. */
export function proxyInput(draft: ProxyDraft): AccountProxyInput {
  return draft.mode === "custom" ? { mode: "custom", url: draft.url.trim() } : { mode: draft.mode };
}

/** A stored proxy address (`scheme://host:port`, never credentials) as its scheme tag and its host; null when it is not one. */
export function proxyParts(url: string): { scheme: string; host: string } | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.+)$/i.exec(url);
  return match === null ? null : { scheme: match[1]!.toUpperCase(), host: match[2]! };
}
