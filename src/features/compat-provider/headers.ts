import type { components } from "../../shared/api/schema";

export type HeadersDraft =
  | { mode: "keep" }
  | { mode: "replace"; rows: { id: number; name: string; value: string }[] }
  | { mode: "clear" };

/** Validate rows before forming a map, so duplicate names cannot overwrite secrets. */
export function validHeaders(draft: HeadersDraft): boolean {
  if (draft.mode !== "replace") return true;
  const names = new Set<string>();
  return draft.rows.length > 0 && draft.rows.every(({ name, value }) => {
    const normalized = name.trim().toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(normalized) || /[\r\n]/.test(name) || value.trim() === "" || /[\x00-\x08\x0a-\x1f\x7f]/.test(value) || names.has(normalized)) return false;
    names.add(normalized);
    return true;
  });
}

/** Omission preserves saved values; an empty object explicitly removes them. */
export function headersInput(draft: HeadersDraft): components["schemas"]["CompatProviderUpdate"]["headers"] {
  if (draft.mode === "keep") return undefined;
  if (draft.mode === "clear") return {};
  return Object.fromEntries(draft.rows.map(({ name, value }) => [name.trim().toLowerCase(), value.trim()]));
}
