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
  announceSessionChange(queryClient);
}

/** Forgets everything the session left in this tab: cached data and an untaken fresh key. */
export function endSession(queryClient: QueryClient): void {
  queryClient.clear();
  dropFreshToken();
}

/**
 * The signed-in identity changed under this tab (another tab signed in or out,
 * or `me` came back as someone else): drop what it shows of the old one and
 * fetch afresh in place. `keepMe` keeps a `me` that is already the new user.
 */
export function resetSession(queryClient: QueryClient, { keepMe = false } = {}): void {
  queryClient.getMutationCache().clear();
  dropFreshToken();
  void queryClient.resetQueries({ predicate: (query) => !keepMe || query.queryKey[0] !== meQuery.queryKey[0] });
}

// Tabs share the session cookie but not their caches: a sign-in or sign-out in
// one tells the others. One channel per query client (per tab), because a
// channel does not receive its own messages.
const CHANNEL = "llm-proxy-session";
const channels = new WeakMap<QueryClient, BroadcastChannel>();

/** Resets this tab's session data whenever another tab signs in or out. Returns the unsubscribe. */
export function listenForSessionChanges(queryClient: QueryClient): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = () => resetSession(queryClient);
  channels.set(queryClient, channel);
  return () => {
    channels.delete(queryClient);
    channel.close();
  };
}

function announceSessionChange(queryClient: QueryClient): void {
  channels.get(queryClient)?.postMessage("session-changed");
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
    announceSessionChange(queryClient);
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
