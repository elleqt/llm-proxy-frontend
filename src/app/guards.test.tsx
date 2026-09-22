import { MutationObserver } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { client, unwrap, type ErrorBody } from "../shared/api/client";
import { en } from "../shared/i18n/en";
import { renderApp } from "../test/render";
import { errorResponse, fixtures, http, server, type Schemas } from "../test/server";

function signedIn(me: Schemas["Me"]) {
  server.use(http.get("/api/me", ({ response }) => response(200).json(me)));
}

async function landsOn(path: string, heading: string) {
  const { router } = renderApp(path);
  expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  return router.state.location.pathname;
}

describe("session guard", () => {
  it("sends an unauthenticated visitor to /login", async () => {
    server.use(
      http.get("/api/me", ({ response }) =>
        response.untyped(errorResponse(401, { code: "unauthenticated", message: "no session" })),
      ),
    );
    expect(await landsOn("/connect", en["page.login.title"])).toBe("/login");
  });

  it("keeps a restricted session on /password wherever it goes", async () => {
    signedIn(fixtures.me({ restricted: true, role: "admin" }));
    expect(await landsOn("/", en["page.password.title"])).toBe("/password");
  });

  it("does not let a restricted administrator into /admin", async () => {
    signedIn(fixtures.me({ restricted: true, role: "admin" }));
    expect(await landsOn("/admin/users", en["page.password.title"])).toBe("/password");
  });

  it("lets a restricted session stay on /password", async () => {
    signedIn(fixtures.me({ restricted: true }));
    expect(await landsOn("/password", en["page.password.title"])).toBe("/password");
  });

  it("lets a full session through", async () => {
    signedIn(fixtures.me());
    expect(await landsOn("/connect", en["page.connect.title"])).toBe("/connect");
  });

  it("shows other failures in place instead of redirecting", async () => {
    server.use(
      http.get("/api/me", ({ response }) =>
        response.untyped(errorResponse(500, { code: "internal", message: "boom" })),
      ),
    );
    const { router } = renderApp("/connect");
    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.unknown"]);
    expect(router.state.location.pathname).toBe("/connect");
  });
});

describe("admin guard", () => {
  it("shows not-found to a non-administrator at /admin/*", async () => {
    signedIn(fixtures.me({ role: "user" }));
    expect(await landsOn("/admin/settings", en["page.notFound.title"])).toBe("/admin/settings");
  });

  it("lets an administrator in", async () => {
    signedIn(fixtures.me({ role: "admin" }));
    expect(await landsOn("/admin", en["page.admin.users.title"])).toBe("/admin/users");
  });
});

describe("any call", () => {
  /** Signs in, opens /connect, then makes one call that fails with `status`/`body`. */
  async function failOneCall(kind: "query" | "mutation", status: number, body: ErrorBody) {
    signedIn(fixtures.me());
    const { router, queryClient } = renderApp("/connect");
    await screen.findByRole("heading", { name: en["page.connect.title"] });
    server.use(http.get("/api/me/tokens", ({ response }) => response.untyped(errorResponse(status, body))));

    const call = () => unwrap(client.GET("/api/me/tokens"));
    const done =
      kind === "query"
        ? queryClient.fetchQuery({ queryKey: ["tokens"], queryFn: call })
        : new MutationObserver(queryClient, { mutationFn: call }).mutate();
    await done.catch(() => undefined);
    return router;
  }

  it("sends the user to /password on 403 password_change_required", async () => {
    const router = await failOneCall("query", 403, { code: "password_change_required", message: "" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/password"));
  });

  it("sends the user to /login on 401", async () => {
    const router = await failOneCall("mutation", 401, { code: "unauthenticated", message: "" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("leaves a 401 invalid_credentials to the screen: the request's credentials were refused, not the session", async () => {
    const router = await failOneCall("mutation", 401, { code: "invalid_credentials", message: "" });
    expect(router.state.location.pathname).toBe("/connect");
  });

  it("leaves any other 403 to the screen", async () => {
    const router = await failOneCall("query", 403, { code: "forbidden", message: "" });
    expect(router.state.location.pathname).toBe("/connect");
  });
});
