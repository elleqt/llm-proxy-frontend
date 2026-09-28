import { queryOptions, useQuery } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Config = components["schemas"]["Config"];
export type AdminConfig = components["schemas"]["AdminConfig"];

/**
 * The deployment's settings the user's interface is rendered with: where the
 * proxied API is and what the cabinet may show. Not cached forever: an
 * administrator can change what users are shown at any time.
 */
export const configQuery = queryOptions({
  queryKey: ["config"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/config", { signal })),
});

export function useConfig() {
  return useQuery(configQuery);
}

/** What the administrator edits of it; every change reaches `configQuery` too. */
export const adminConfigQuery = queryOptions({
  queryKey: ["admin", "config"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/config", { signal })),
});
