import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Token = components["schemas"]["Token"];

/** The caller's tokens, newest first, revoked ones included. */
export const tokensQuery = queryOptions({
  queryKey: ["tokens"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me/tokens", { signal })),
});

/** A token issued in this tab, with its secret. */
export interface FreshToken {
  id: string;
  label: string;
  secret: string;
}

// The secret lives in the query cache and nowhere else: memory of this tab
// only, and gone with everything else when sign-in or sign-out clears the cache.
const freshTokenQuery = queryOptions({
  queryKey: ["fresh-token"],
  queryFn: (): FreshToken | null => null,
  staleTime: Infinity,
  gcTime: Infinity,
});

export function rememberFreshToken(queryClient: QueryClient, token: FreshToken): void {
  // Set before the data, so the entry is never collected while no screen shows it.
  queryClient.setQueryDefaults(freshTokenQuery.queryKey, { staleTime: Infinity, gcTime: Infinity });
  queryClient.setQueryData(freshTokenQuery.queryKey, token);
}

/** Drops the fresh token if it is the one with `id` (e.g. it was just revoked). */
export function forgetFreshToken(queryClient: QueryClient, id: string): void {
  if (queryClient.getQueryData(freshTokenQuery.queryKey)?.id === id) {
    queryClient.setQueryData(freshTokenQuery.queryKey, null);
  }
}

export function useFreshToken(): FreshToken | null {
  return useQuery(freshTokenQuery).data ?? null;
}
