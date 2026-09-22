import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../shared/i18n/en";
import { renderApp } from "../test/render";
import { fixtures, http, server, type Schemas } from "../test/server";

function signedIn(me: Schemas["Me"]) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(me)),
    http.get("/api/connect", ({ response }) => response(200).json({ apiBaseURL: "https://llm.example.com" })),
  );
}

async function navigation() {
  return within(await screen.findByRole("navigation", { name: en["nav.label"] }));
}

describe("header navigation", () => {
  it("offers a user the cabinet, connect and sign-out, but no admin", async () => {
    signedIn(fixtures.me({ role: "user" }));
    renderApp("/connect");

    const nav = await navigation();
    expect(nav.getByRole("link", { name: en["nav.cabinet"] })).toHaveAttribute("href", "/");
    expect(nav.getByRole("link", { name: en["nav.connect"] })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("button", { name: en["session.signOut"] })).toBeInTheDocument();
    expect(nav.queryByRole("link", { name: en["nav.admin"] })).not.toBeInTheDocument();
  });

  it("offers an administrator the admin screens", async () => {
    signedIn(fixtures.me({ role: "admin" }));
    renderApp("/connect");

    expect((await navigation()).getByRole("link", { name: en["nav.admin"] })).toHaveAttribute("href", "/admin");
  });

  it("offers a restricted session only sign-out", async () => {
    signedIn(fixtures.me({ role: "admin", restricted: true }));
    renderApp("/password");

    const nav = await navigation();
    expect(nav.queryAllByRole("link")).toEqual([]);
    expect(nav.getByRole("button", { name: en["session.signOut"] })).toBeInTheDocument();
  });

  it("is absent on /login, which does not ask who is signed in", async () => {
    let meRequests = 0;
    server.use(
      http.get("/api/auth/config", ({ response }) => response(200).json({ localLogin: true, oidc: { enabled: false } })),
      http.get("/api/me", ({ response }) => {
        meRequests += 1;
        return response(200).json(fixtures.me());
      }),
    );
    renderApp("/login");

    expect(await screen.findByLabelText(en["login.email"])).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: en["nav.label"] })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: en["app.name"] })).toHaveAttribute("href", "/");
    expect(meRequests).toBe(0);
  });
});
