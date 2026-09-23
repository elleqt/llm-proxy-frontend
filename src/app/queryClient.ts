import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { meQuery } from "../entities/user/me";
import { endSession, listenForSessionChanges, resetSession } from "../features/session/session";
import { ApiError, PasswordChangeRequiredError, UnauthenticatedError } from "../shared/api/client";

/**
 * The query client, wired so that any query or mutation failing with
 * 401 forgets the session and sends the user to /login, and with 403 `password_change_required` to
 * /password. Other failures are left to the screen that made the call.
 */
export function createQueryClient(navigate: (to: "/login" | "/password") => void): QueryClient {
  const onError = (error: Error) => {
    // `invalid_credentials` is a 401 refusing the credentials in the request
    // body (sign-in, current password) — the screen shows it; it is not a lost session.
    if (error instanceof UnauthenticatedError && error.code !== "invalid_credentials") {
      // The session is gone: nothing of it may render on /login or for the next user.
      navigate("/login");
      endSession(queryClient);
    } else if (error instanceof PasswordChangeRequiredError) {
      void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      navigate("/password");
    }
  };
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // A 4xx answer will not change on retry; network failures and 5xx may.
        retry: (failures, error) =>
          failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });

  // `me` answering as someone else (another tab signed in as another user and
  // this one refetched, e.g. on focus) means nothing cached here is theirs.
  let signedIn: string | undefined;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] !== meQuery.queryKey[0]) return;
    if (event.type === "removed") {
      signedIn = undefined;
    } else if (event.type === "updated" && event.action.type === "success") {
      const id = (event.action.data as { id: string } | undefined)?.id;
      const changed = signedIn !== undefined && id !== signedIn;
      signedIn = id;
      // Deferred: the cache is mid-notification here.
      if (changed) queueMicrotask(() => resetSession(queryClient, { keepMe: true }));
    }
  });
  listenForSessionChanges(queryClient);
  return queryClient;
}
