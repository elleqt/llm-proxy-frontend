import { queryOptions, useQuery } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me", { signal })),
});

/** The signed-in user. Below the session guard it is always loaded. */
export function useMe() {
  return useQuery(meQuery);
}
