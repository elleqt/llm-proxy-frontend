import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

/**
 * The models the caller's keys may use right now, grouped by provider in the
 * server's order. Its own first key segment: the session logic watches `["me"]`.
 */
export const myModelsQuery = queryOptions({
  queryKey: ["my-models"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me/models", { signal })),
});

/**
 * The providers the caller can actually call: one whose models are all
 * unpriced is listed, but spend limits refuse every request to it.
 */
export function usableProviders(catalog: components["schemas"]["Catalog"]): components["schemas"]["Catalog"]["providers"] {
  return catalog.providers.filter((provider) => provider.models.length > 0);
}
