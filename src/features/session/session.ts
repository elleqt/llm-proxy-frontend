import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { dropFreshToken } from "../../entities/token/tokens";
import { meQuery } from "../../entities/user/me";
import { client, UnauthenticatedError, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

/**
 * A new session begins: nothing cached for whoever was here before survives,
 * and `me` is the signed-in user straight away.
 */
export function startSession(queryClient: QueryClient, me: components["schemas"]["Me"]): void {
  endSession(queryClient);
  queryClient.setQueryData(meQuery.queryKey, me);
}

/** Forgets everything the session left in this tab: cached data and an untaken fresh key. */
export function endSession(queryClient: QueryClient): void {
  queryClient.clear();
  dropFreshToken();
}

/**
 * Signs out and forgets everything cached, then goes to /login. A 401 means
 * the session was already gone, which is the same outcome; any other failure
 * leaves the user signed in and is the caller's to show.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const end = () => {
    endSession(queryClient);
    void navigate("/login", { replace: true });
  };
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/auth/logout")),
    onSuccess: end,
    onError: (error) => {
      if (error instanceof UnauthenticatedError) end();
    },
  });
}
