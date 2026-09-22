import type { QueryClient } from "@tanstack/react-query";

/**
 * Everything the query client holds — query data, mutation results and
 * mutation variables — as one string, to assert a one-time secret is in none of it.
 */
export function cached(queryClient: QueryClient): string {
  return JSON.stringify([
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => [mutation.state.data, mutation.state.variables]),
  ]);
}
