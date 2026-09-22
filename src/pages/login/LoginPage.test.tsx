import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderApp } from "../../test/render";
import { fixtures, http, server, type Schemas } from "../../test/server";

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
    const idp = screen.getByRole("button", { name: "Sign in with Example ID" });
    expect(idp.closest("form")).toHaveAttribute("action", "/api/auth/oidc/start");
  });

  it("offers no form when local sign-in is off", async () => {
    authConfig({ localLogin: false, oidc: { enabled: true } });
    renderApp("/login");

    expect(await screen.findByRole("button", { name: en["login.oidcGeneric"] })).toBeInTheDocument();
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

  it("says when to retry after locked_out, from Retry-After", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-23T10:00:30Z") });
    authConfig(both);
    server.use(
      http.post("/api/auth/login", ({ response }) =>
        response.untyped(
          HttpResponse.json(
            { code: "locked_out", message: "locked out" },
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
      en["login.lockedOutUntil"].replace("{time}", time),
    );
  });

  it("explains an identity-provider refusal passed back in ?error=", async () => {
    authConfig(both);
    renderApp("/login?error=oidc_forbidden");

    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.oidc_forbidden"]);
  });
});

describe("sign-out", () => {
  it("forgets the first user's data: the next user never sees their keys", async () => {
    authConfig(both);
    const ada = fixtures.me();
    cabinetOf(ada, [fixtures.token({ label: "ada-laptop" })]);
    server.use(http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { router } = renderApp("/");
    expect(await screen.findByText("ada-laptop")).toBeInTheDocument();

    const user = userEvent.setup();
    const nav = screen.getByRole("navigation", { name: en["nav.label"] });
    await user.click(within(nav).getByRole("button", { name: en["session.signOut"] }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByRole("navigation", { name: en["nav.label"] })).not.toBeInTheDocument();

    // Bob's keys are held back until the check below: until they arrive the
    // cabinet may show a spinner, never Ada's list.
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
  });
});
