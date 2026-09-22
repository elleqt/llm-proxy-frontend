import { describe, expect, it } from "vitest";
import { client, unwrap } from "../shared/api/client";
import { errorResponse, http, server } from "../test/server";
import { createQueryClient } from "./queryClient";

/** Fetches /api/me/tokens once through the application's query client; returns how many requests it took. */
async function requestsFor(status: number, code: string): Promise<number> {
  let requests = 0;
  server.use(
    http.get("/api/me/tokens", ({ response }) => {
      requests += 1;
      return response.untyped(errorResponse(status, { code, message: "" }));
    }),
  );
  const queryClient = createQueryClient(() => undefined);
  // The application's retry predicate, without the backoff.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } });
  await queryClient
    .fetchQuery({ queryKey: ["tokens"], queryFn: () => unwrap(client.GET("/api/me/tokens")) })
    .catch(() => undefined);
  return requests;
}

describe("query retry policy", () => {
  it("does not retry a 4xx: the answer will not change", async () => {
    expect(await requestsFor(401, "unauthenticated")).toBe(1);
    expect(await requestsFor(403, "forbidden")).toBe(1);
  });

  it("retries a 5xx twice", async () => {
    expect(await requestsFor(500, "internal")).toBe(3);
  });
});
