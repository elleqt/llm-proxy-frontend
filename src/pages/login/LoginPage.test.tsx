import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../shared/i18n/en";
import { handOffFreshToken, takeFreshToken } from "../../entities/token/tokens";
import { createQueryClient } from "../../app/queryClient";
import { startSession } from "../../features/session/session";
import { renderApp } from "../../test/render";
import { errorResponse, fixtures, http, server, type Schemas } from "../../test/server";

function authConfig(config: Schemas["AuthConfig"]) {
  server.use(http.get("/api/auth/config", ({ response }) => response(200).json(config)));
}

const both: Schemas["AuthConfig"] = { localLogin: true, oidc: { enabled: true, displayName: "Example ID" } };

async function submitCredentials(email = "ada@example.com", password = "correct horse") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(en["login.email"]), email);
  await user.type(screen.getByLabelText(en["login.password"]), password);
  await user.click(screen.getByRole("button", { name: en["login.submit"] }));
}

/** A signed-in user whose cabinet is empty. */
function cabinetOf(me: Schemas["Me"], tokens: Schemas["Token"][] = []) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(me)),
    http.get("/api/me/tokens", ({ response }) => response(200).json(tokens)),
    http.get("/api/me/usage", ({ response }) => response(200).json(fixtures.usage())),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("/login", () => {
  it("offers what /api/auth/config allows: the form and the identity provider", async () => {
    authConfig(both);
    renderApp("/login");

    expect(await screen.findByLabelText(en["login.email"])).toBeInTheDocument();
    const idp = screen.getByRole("link", { name: "Sign in with Example ID" });
    expect(idp).toHaveAttribute("href", "/api/auth/oidc/start");
  });

  it("offers no form when local sign-in is off", async () => {
    authConfig({ localLogin: false, oidc: { enabled: true } });
    renderApp("/login");

    expect(await screen.findByRole("link", { name: en["login.oidcGeneric"] })).toBeInTheDocument();
    expect(screen.queryByLabelText(en["login.email"])).not.toBeInTheDocument();
  });

  it("offers only the form when the identity provider is off", async () => {
    authConfig({ localLogin: true, oidc: { enabled: false } });
    renderApp("/login");

    expect(await screen.findByLabelText(en["login.email"])).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sign in with/ })).not.toBeInTheDocument();
  });

  it("says sign-in is unavailable when neither is offered", async () => {
    authConfig({ localLogin: false, oidc: { enabled: false } });
    renderApp("/login");

    expect(await screen.findByText(en["login.unavailable"])).toBeInTheDocument();
    expect(screen.queryByLabelText(en["login.email"])).not.toBeInTheDocument();
  });

  it("signs in and opens the cabinet", async () => {
    authConfig(both);
    let sent: unknown;
    server.use(
      http.post("/api/auth/login", async ({ request, response }) => {
        sent = await request.json();
        return response(200).json(fixtures.me());
      }),
    );
    cabinetOf(fixtures.me());
    const { router } = renderApp("/login");

    await submitCredentials();

    expect(await screen.findByRole("heading", { level: 1, name: en["page.cabinet.title"] })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(sent).toEqual({ email: "ada@example.com", password: "correct horse" });
  });

  it("sends a temporary-password session to /password", async () => {
    authConfig(both);
    const restricted = fixtures.me({ restricted: true });
    server.use(http.post("/api/auth/login", ({ response }) => response(200).json(restricted)));
    cabinetOf(restricted);
    const { router } = renderApp("/login");

    await submitCredentials();

    expect(await screen.findByRole("heading", { level: 1, name: en["page.password.title"] })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/password");
  });

  it("says local sign-in is off when the server answers 404, and stays on /login", async () => {
    authConfig(both);
    server.use(
      http.post("/api/auth/login", ({ response }) =>
        response.untyped(errorResponse(404, { code: "not_found", message: "" })),
      ),
    );
    const { router } = renderApp("/login");

    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(en["login.localDisabled"]);
    expect(router.state.location.pathname).toBe("/login");
  });

  it("keeps a refused password nowhere: not in the field, not in the mutation cache", async () => {
    authConfig(both);
    server.use(
      http.post("/api/auth/login", ({ response }) =>
        response(401).json({ code: "invalid_credentials", message: "invalid credentials" }),
      ),
    );
    const { queryClient } = renderApp("/login");

    await submitCredentials("ada@example.com", "hunter2-typed-wrong");

    await screen.findByRole("alert");
    expect(screen.getByLabelText(en["login.password"])).toHaveValue("");
    const mutations = queryClient.getMutationCache().getAll().map((mutation) => mutation.state);
    expect(JSON.stringify(mutations)).not.toContain("hunter2-typed-wrong");
  });

  it("shows invalid_credentials in place and stays on /login", async () => {
    authConfig(both);
    server.use(
      http.post("/api/auth/login", ({ response }) =>
        response(401).json({ code: "invalid_credentials", message: "invalid credentials" }),
      ),
    );
    const { router } = renderApp("/login");

    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.invalid_credentials"]);
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByLabelText(en["login.email"])).toHaveValue("ada@example.com");
  });

  it.each([
    ["locked_out", "login.lockedOutUntil"],
    ["rate_limited", "login.rateLimitedUntil"],
  ] as const)("says when to retry after %s, from Retry-After", async (code, message) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-23T10:00:30Z") });
    authConfig(both);
    server.use(
      http.post("/api/auth/login", ({ response }) =>
        response.untyped(
          HttpResponse.json(
            { code, message: "" },
            { status: 429, headers: { "Retry-After": "300" } },
          ),
        ),
      ),
    );
    renderApp("/login");

    await submitCredentials();

    // 10:05:30 is rounded up to the next whole minute.
    const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(
      new Date("2026-09-23T10:06:00Z"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en[message].replace("{time}", time),
    );
  });

  it.each(["oidc_forbidden", "oidc_failed", "rate_limited"] as const)("explains ?error=%s from the identity-provider routes", async (code) => {
    authConfig(both);
    renderApp(`/login?error=${code}`);

    expect(await screen.findByRole("alert")).toHaveTextContent(en[`error.${code}`]);
  });
});

/**
 * Signs Bob in from /login and proves the cabinet never shows Ada's key: Bob's
 * keys are held back until checked, so until they arrive only a stale cache
 * could put anything in the table.
 */
async function signInAsBobSeeingOnlyBob() {
  let releaseBob = () => {};
  const bobTokens = new Promise<void>((resolve) => {
    releaseBob = resolve;
  });
  const bob = fixtures.me({ id: "00000000-0000-4000-8000-000000000002", displayName: "Bob", email: "bob@example.com" });
  server.use(
    http.post("/api/auth/login", ({ response }) => response(200).json(bob)),
    http.get("/api/me", ({ response }) => response(200).json(bob)),
    http.get("/api/me/tokens", async ({ response }) => {
      await bobTokens;
      return response(200).json([fixtures.token({ id: "00000000-0000-4000-8000-0000000000b1", label: "bob-desktop" })]);
    }),
  );
  await submitCredentials("bob@example.com");

  expect(await screen.findByRole("heading", { level: 1, name: en["page.cabinet.title"] })).toBeInTheDocument();
  expect(screen.queryByText("ada-laptop")).not.toBeInTheDocument();
  releaseBob();
  expect(await screen.findByText("bob-desktop")).toBeInTheDocument();
  expect(screen.queryByText("ada-laptop")).not.toBeInTheDocument();
}

/** Ada is signed in and her cabinet, with her key, is on screen. */
async function adaInHerCabinet() {
  authConfig(both);
  cabinetOf(fixtures.me(), [fixtures.token({ label: "ada-laptop" })]);
  const app = renderApp("/");
  expect(await screen.findByText("ada-laptop")).toBeInTheDocument();
  return app;
}

const ADA_KEY = { id: "00000000-0000-4000-8000-0000000000a9", label: "ada-laptop", secret: "sk-ada-secret" };

describe("session boundaries", () => {
  it("sign-out forgets the first user's data: the next user never sees their keys", async () => {
    server.use(http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { router } = await adaInHerCabinet();
    handOffFreshToken(ADA_KEY);

    const nav = screen.getByRole("navigation", { name: en["nav.label"] });
    await userEvent.click(within(nav).getByRole("button", { name: en["session.signOut"] }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByRole("navigation", { name: en["nav.label"] })).not.toBeInTheDocument();
    expect(takeFreshToken()).toBeNull();

    await signInAsBobSeeingOnlyBob();
  });

  it("treats a 401 from sign-out as signed out", async () => {
    server.use(
      http.post("/api/auth/logout", ({ response }) =>
        response.untyped(errorResponse(401, { code: "unauthenticated", message: "" })),
      ),
    );
    const { router, queryClient } = await adaInHerCabinet();

    const nav = screen.getByRole("navigation", { name: en["nav.label"] });
    await userEvent.click(within(nav).getByRole("button", { name: en["session.signOut"] }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByRole("navigation", { name: en["nav.label"] })).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["tokens"])).toBeUndefined();
  });

  it("a lost session (401) forgets everything before /login shows", async () => {
    const { router, queryClient } = await adaInHerCabinet();
    handOffFreshToken(ADA_KEY);
    server.use(
      http.get("/api/me/tokens", ({ response }) =>
        response.untyped(errorResponse(401, { code: "unauthenticated", message: "" })),
      ),
    );

    await queryClient.invalidateQueries({ queryKey: ["tokens"] });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByRole("navigation", { name: en["nav.label"] })).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    expect(takeFreshToken()).toBeNull();
  });

  it("signing in over a session never shows the previous user's data", async () => {
    const { router } = await adaInHerCabinet();
    handOffFreshToken(ADA_KEY);

    await router.navigate("/login");
    await signInAsBobSeeingOnlyBob();
    expect(takeFreshToken()).toBeNull();
  });

  it("a `me` that comes back as someone else drops the previous user's data in place", async () => {
    const { queryClient } = await adaInHerCabinet();
    const releaseBob = bobSignedInOnTheServer();

    // What a refetch on focus does after another tab signed in as Bob.
    await queryClient.refetchQueries({ queryKey: ["me"] });

    await waitFor(() => expect(screen.queryByText("ada-laptop")).not.toBeInTheDocument());
    releaseBob();
    expect(await screen.findByText("bob-desktop")).toBeInTheDocument();
  });

  it("another tab signing in drops this tab's data", async () => {
    await adaInHerCabinet();
    const releaseBob = bobSignedInOnTheServer();
    const otherTab = createQueryClient(() => undefined);

    startSession(otherTab, bob);

    await waitFor(() => expect(screen.queryByText("ada-laptop")).not.toBeInTheDocument());
    releaseBob();
    expect(await screen.findByText("bob-desktop")).toBeInTheDocument();
  });

  it("another tab signing out sends this tab to /login", async () => {
    server.use(http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { router } = await adaInHerCabinet();
    const otherTab = renderApp("/");
    const otherNav = await within(otherTab.container).findByRole("navigation", { name: en["nav.label"] });
    server.use(
      http.get("/api/me", ({ response }) =>
        response.untyped(errorResponse(401, { code: "unauthenticated", message: "" })),
      ),
    );

    await userEvent.click(within(otherNav).getByRole("button", { name: en["session.signOut"] }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText("ada-laptop")).not.toBeInTheDocument();
  });
});

const bob = fixtures.me({ id: "00000000-0000-4000-8000-000000000002", displayName: "Bob", email: "bob@example.com" });

/** The server now answers for Bob; his key list waits for the returned release. */
function bobSignedInOnTheServer(): () => void {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(bob)),
    http.get("/api/me/tokens", async ({ response }) => {
      await held;
      return response(200).json([fixtures.token({ id: "00000000-0000-4000-8000-0000000000b1", label: "bob-desktop" })]);
    }),
  );
  return release;
}
