import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";

/** What the sign-in screen may offer: the form, the identity provider, or both. */
export const authConfigQuery = queryOptions({
  queryKey: ["auth-config"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/auth/config", { signal })),
  staleTime: Infinity,
});

/** Where the identity-provider sign-in starts: a full-page navigation, not a fetch. */
export const OIDC_START_PATH = "/api/auth/oidc/start";
