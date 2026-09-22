import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { meQuery } from "../entities/user/me";
import { ApiError, PasswordChangeRequiredError, UnauthenticatedError } from "../shared/api/client";

/**
 * The query client, wired so that any query or mutation failing with
 * 401 sends the user to /login and with 403 `password_change_required` to
 * /password. Other failures are left to the screen that made the call.
 */
export function createQueryClient(navigate: (to: "/login" | "/password") => void): QueryClient {
  const onError = (error: Error) => {
    // `invalid_credentials` is a 401 refusing the credentials in the request
    // body (sign-in, current password) — the screen shows it; it is not a lost session.
    if (error instanceof UnauthenticatedError && error.code !== "invalid_credentials") {
      navigate("/login");
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
  return queryClient;
}
