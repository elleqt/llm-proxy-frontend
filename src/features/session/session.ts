import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { meQuery } from "../../entities/user/me";
import { client, UnauthenticatedError, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

/**
 * A new session begins: nothing cached for whoever was here before survives,
 * and `me` is the signed-in user straight away.
 */
export function startSession(queryClient: QueryClient, me: components["schemas"]["Me"]): void {
  queryClient.clear();
  queryClient.setQueryData(meQuery.queryKey, me);
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
    queryClient.clear();
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
