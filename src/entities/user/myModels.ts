import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";

/**
 * The models the caller's keys may use right now, grouped by provider in the
 * server's order. Its own first key segment: the session logic watches `["me"]`.
 */
export const myModelsQuery = queryOptions({
  queryKey: ["my-models"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me/models", { signal })),
});
