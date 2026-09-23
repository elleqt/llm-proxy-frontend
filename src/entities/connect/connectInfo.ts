import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";

/** The deployment's addresses; the client holds the per-tool templates. */
export const connectInfoQuery = queryOptions({
  queryKey: ["connect"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/connect", { signal })),
  staleTime: Infinity,
});
