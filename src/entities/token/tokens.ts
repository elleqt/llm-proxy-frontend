import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Token = components["schemas"]["Token"];

/** The caller's tokens, newest first, revoked ones included. */
export const tokensQuery = queryOptions({
  queryKey: ["tokens"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me/tokens", { signal })),
});

/** A token just issued in this tab, with its secret. */
export interface FreshToken {
  id: string;
  label: string;
  secret: string;
}

// A single-use hand-off from the issue dialog to /connect, outside every
// cache: the dialog puts the key here only when the user follows its /connect
// link, and /connect takes it on mount, leaving the holder empty.
let pending: FreshToken | null = null;

export function handOffFreshToken(token: FreshToken): void {
  pending = token;
}

/** Returns the handed-off key, if any, and empties the holder. */
export function takeFreshToken(): FreshToken | null {
  const token = pending;
  pending = null;
  return token;
}

/** Drops a key not yet taken: on sign-in, sign-out, a lost session, or — for `id` only — its revocation. */
export function dropFreshToken(id?: string): void {
  if (id === undefined || pending?.id === id) pending = null;
}
