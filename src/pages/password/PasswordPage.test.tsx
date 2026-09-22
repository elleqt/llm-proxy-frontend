import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { ru } from "../../shared/i18n/ru";
import { renderApp } from "../../test/render";
import { fixtures, http, server, type Schemas } from "../../test/server";

const NEW_PASSWORD = "a much longer password";

/** `/api/me` answers `me()` at the time of the call, so a test can change it mid-flow. */
function session(me: () => Schemas["Me"]) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(me())),
    http.get("/api/me/tokens", ({ response }) => response(200).json([])),
    http.get("/api/me/usage", ({ response }) => response(200).json(fixtures.usage())),
  );
}

async function fillNew(password: string, repeat = password) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(en["password.new"]), password);
  await user.type(screen.getByLabelText(en["password.repeat"]), repeat);
  return user;
}

describe("/password in a restricted session", () => {
  it("asks only for the new password, states the rules up front, and opens the cabinet once changed", async () => {
    let restricted = true;
    session(() => fixtures.me({ restricted }));
    let sent: unknown;
    server.use(
      http.post("/api/auth/password", async ({ request }) => {
        sent = await request.json();
        restricted = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp("/password");

    const field = await screen.findByLabelText(en["password.new"]);
    expect(field).toHaveAccessibleDescription(en["password.rules"]);
    expect(screen.queryByLabelText(en["password.current"])).not.toBeInTheDocument();

    const user = await fillNew(NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: en["password.submit"] }));

    // Only a refetched `me` (restricted: false) lets the guard through to /.
    expect(await screen.findByRole("heading", { level: 1, name: en["page.cabinet.title"] })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(sent).toEqual({ newPassword: NEW_PASSWORD });
  });

  it("refuses a password shorter than the rule before sending it", async () => {
    session(() => fixtures.me({ restricted: true }));
    let requests = 0;
    server.use(
      http.post("/api/auth/password", () => {
        requests += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp("/password");

    const user = await fillNew("short");
    await user.click(screen.getByRole("button", { name: en["password.submit"] }));

    expect(screen.getByLabelText(en["password.new"])).toHaveAccessibleDescription(
      `${en["password.rules"]} ${en["password.tooShort"]}`,
    );
    expect(requests).toBe(0);
  });

  it("refuses a repeat that does not match, before sending anything", async () => {
    session(() => fixtures.me({ restricted: true }));
    let requests = 0;
    server.use(
      http.post("/api/auth/password", () => {
        requests += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp("/password");

    const user = await fillNew(NEW_PASSWORD, `${NEW_PASSWORD}!`);
    await user.click(screen.getByRole("button", { name: en["password.submit"] }));

    expect(screen.getByLabelText(en["password.repeat"])).toHaveAccessibleDescription(en["password.mismatch"]);
    expect(requests).toBe(0);
  });

  it("shows a refusal in the language chosen after it appeared", async () => {
    session(() => fixtures.me({ restricted: true }));
    renderApp("/password");

    const user = await fillNew("short");
    await user.click(screen.getByRole("button", { name: en["password.submit"] }));
    await user.click(screen.getByRole("button", { name: en["prefs.lang.ru"] }));

    expect(screen.getByLabelText(ru["password.new"])).toHaveAccessibleDescription(
      `${ru["password.rules"]} ${ru["password.tooShort"]}`,
    );
  });

  it("says an expired temporary password needs a new one, and signs out from there", async () => {
    session(() => fixtures.me({ restricted: true }));
    server.use(
      http.post("/api/auth/password", ({ response }) =>
        response(401).json({ code: "invalid_credentials", message: "invalid credentials" }),
      ),
      http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
      http.get("/api/auth/config", ({ response }) => response(200).json({ localLogin: true, oidc: { enabled: false } })),
    );
    const { router } = renderApp("/password");

    const user = await fillNew(NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: en["password.submit"] }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en["password.temporaryExpired"]);
    expect(alert).not.toHaveTextContent(en["error.invalid_credentials"]);
    expect(router.state.location.pathname).toBe("/password");

    await user.click(within(alert).getByRole("button", { name: en["session.signOut"] }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await screen.findByRole("heading", { level: 1, name: en["page.login.title"] })).toBeInTheDocument();
  });
});

describe("/password in a full session", () => {
  it("asks for the current password and shows its refusal on that field", async () => {
    session(() => fixtures.me());
    let sent: unknown;
    server.use(
      http.post("/api/auth/password", async ({ request, response }) => {
        sent = await request.json();
        return response(401).json({ code: "invalid_credentials", message: "invalid credentials" });
      }),
    );
    const { router } = renderApp("/password");

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(en["password.current"]), "not it");
    await fillNew(NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: en["password.submit"] }));

    await waitFor(() =>
      expect(screen.getByLabelText(en["password.current"])).toHaveAccessibleDescription(
        en["errorIn.password.invalid_credentials"],
      ),
    );
    expect(sent).toEqual({ currentPassword: "not it", newPassword: NEW_PASSWORD });
    expect(router.state.location.pathname).toBe("/password");
  });
});
