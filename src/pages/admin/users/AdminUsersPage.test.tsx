import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { en } from "../../../shared/i18n/en";
import { fill } from "../../../shared/lib/template";
import { renderApp } from "../../../test/render";
import { fixtures, http, server, type Schemas } from "../../../test/server";

const TEMP_PASSWORD = "tmp-Qx7-example-only";

function admin(users: Schemas["AdminUser"][]) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "admin" }))),
    http.get("/api/admin/users", ({ response }) => response(200).json(users)),
  );
}

/** Answers creation like the backend: a password only for a human with password sign-in. */
function acceptCreation(sent: Schemas["CreateUserRequest"][]) {
  server.use(
    http.post("/api/admin/users", async ({ request, response }) => {
      const body = await request.json();
      sent.push(body);
      const user = fixtures.adminUser({
        id: "00000000-0000-4000-8000-0000000000c1",
        kind: body.kind,
        displayName: body.displayName,
        email: body.email ?? null,
        signIn: body.kind === "service" ? [] : [body.signIn ?? "password"],
        policy: body.policy,
      });
      return response(201).json(
        body.kind === "human" && body.signIn === "password"
          ? { user, temporaryPassword: { password: TEMP_PASSWORD, expiresAt: "2026-09-26T09:00:00Z" } }
          : { user },
      );
    }),
  );
}

async function fillHuman(user: UserEvent, signIn: "password" | "oidc") {
  await user.click(await screen.findByRole("button", { name: en["admin.createUser"] }));
  const dialog = screen.getByRole("dialog", { name: en["admin.createUser"] });
  await user.type(within(dialog).getByLabelText(en["admin.displayName"]), "Linus Example");
  await user.type(within(dialog).getByLabelText(en["admin.email"]), "linus@example.com");
  await user.selectOptions(within(dialog).getByLabelText(en["admin.signIn"]), signIn);
  await user.click(within(dialog).getByRole("button", { name: en["admin.createUserSubmit"] }));
}

describe("creating accounts", () => {
  it("shows a password user's temporary password once, with its expiry", async () => {
    const sent: Schemas["CreateUserRequest"][] = [];
    admin([]);
    acceptCreation(sent);
    const user = userEvent.setup();
    renderApp("/admin/users");

    await fillHuman(user, "password");

    const result = await screen.findByRole("dialog", {
      name: fill(en["admin.createdTitle"], { name: "Linus Example" }),
    });
    expect(within(result).getByRole("textbox", { name: en["admin.tempPassword"] })).toHaveTextContent(TEMP_PASSWORD);
    expect(result).toHaveTextContent(/2026/);
    expect(sent).toEqual([
      {
        kind: "human",
        displayName: "Linus Example",
        email: "linus@example.com",
        role: "user",
        signIn: "password",
        policy: [],
      },
    ]);

    await user.click(within(result).getByRole("button", { name: en["issue.done"] }));
    await user.click(screen.getByRole("button", { name: en["admin.createUser"] }));
    expect(screen.getByRole("dialog", { name: en["admin.createUser"] })).not.toHaveTextContent(TEMP_PASSWORD);
    expect(screen.queryByText(TEMP_PASSWORD)).not.toBeInTheDocument();
  });

  it("tells that an identity-provider user is claimed by their first sign-in, with no password", async () => {
    const sent: Schemas["CreateUserRequest"][] = [];
    admin([]);
    acceptCreation(sent);
    const user = userEvent.setup();
    renderApp("/admin/users");

    await fillHuman(user, "oidc");

    const result = await screen.findByRole("dialog", {
      name: fill(en["admin.createdTitle"], { name: "Linus Example" }),
    });
    expect(result).toHaveTextContent(fill(en["admin.createdOidc"], { email: "linus@example.com" }));
    expect(within(result).queryByRole("textbox")).not.toBeInTheDocument();
    expect(sent[0]?.signIn).toBe("oidc");
  });

  it("creates a service account without email, sign-in or password", async () => {
    const sent: Schemas["CreateUserRequest"][] = [];
    admin([]);
    acceptCreation(sent);
    const user = userEvent.setup();
    renderApp("/admin/users");

    await user.click(await screen.findByRole("button", { name: en["admin.createService"] }));
    const dialog = screen.getByRole("dialog", { name: en["admin.createService"] });
    expect(within(dialog).queryByLabelText(en["admin.email"])).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(en["admin.signIn"])).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(en["admin.displayName"]), "nightly-report");
    await user.click(within(dialog).getByRole("button", { name: en["admin.createServiceSubmit"] }));

    const result = await screen.findByRole("dialog", {
      name: fill(en["admin.createdTitle"], { name: "nightly-report" }),
    });
    expect(result).toHaveTextContent(en["admin.createdService"]);
    expect(within(result).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(result).getByRole("link", { name: en["admin.openAccount"] })).toHaveAttribute(
      "href",
      "/admin/users/00000000-0000-4000-8000-0000000000c1",
    );
    expect(sent).toEqual([{ kind: "service", displayName: "nightly-report", policy: [] }]);
  });

  it("shows email_taken on the email field and keeps the form", async () => {
    admin([]);
    server.use(
      http.post("/api/admin/users", ({ response }) => response(409).json({ code: "email_taken", message: "taken" })),
    );
    const user = userEvent.setup();
    renderApp("/admin/users");

    await fillHuman(user, "password");

    const email = await screen.findByLabelText(en["admin.email"]);
    await waitFor(() => expect(email).toHaveAccessibleDescription(en["error.email_taken"]));
    expect(email).toHaveValue("linus@example.com");
  });
});

describe("user list", () => {
  const people = [
    fixtures.adminUser(),
    fixtures.adminUser({
      id: "00000000-0000-4000-8000-0000000000b2",
      displayName: "Report bot",
      kind: "service",
      email: null,
      signIn: [],
      lastSeenAt: null,
    }),
    fixtures.adminUser({
      id: "00000000-0000-4000-8000-0000000000b3",
      displayName: "Hedy Example",
      email: "hedy@example.com",
      status: "blocked",
      signIn: ["oidc"],
    }),
  ];

  const names = () =>
    screen
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((name) => people.some((p) => p.displayName === name));

  it("filters by kind, status and sign-in method, and searches name and email", async () => {
    admin(people);
    const user = userEvent.setup();
    renderApp("/admin/users");
    await screen.findByRole("link", { name: "Report bot" });
    expect(names()).toEqual(["Grace Example", "Report bot", "Hedy Example"]);

    await user.selectOptions(screen.getByLabelText(en["admin.kind"]), "service");
    expect(names()).toEqual(["Report bot"]);
    await user.selectOptions(screen.getByLabelText(en["admin.kind"]), "all");

    await user.selectOptions(screen.getByLabelText(en["admin.status"]), "blocked");
    expect(names()).toEqual(["Hedy Example"]);
    await user.selectOptions(screen.getByLabelText(en["admin.status"]), "all");

    await user.selectOptions(screen.getByLabelText(en["admin.signIn"]), "password");
    expect(names()).toEqual(["Grace Example"]);
    await user.selectOptions(screen.getByLabelText(en["admin.signIn"]), "all");

    await user.type(screen.getByRole("searchbox", { name: en["admin.search"] }), "HEDY@");
    expect(names()).toEqual(["Hedy Example"]);
  });

  it("states an account that was never active", async () => {
    admin(people);
    renderApp("/admin/users");
    const row = (await screen.findByRole("link", { name: "Report bot" })).closest("tr") as HTMLElement;
    expect(row).toHaveTextContent(en["admin.neverSeen"]);
    expect(row).toHaveTextContent(en["admin.kind.service"]);
  });
});

describe("admin section", () => {
  it("is not found for a non-administrator, who never loads admin data", async () => {
    let adminCalls = 0;
    server.use(
      http.get("/api/me", ({ response }) => response(200).json(fixtures.me({ role: "user" }))),
      http.get("/api/admin/users", ({ response }) => {
        adminCalls++;
        return response(200).json([]);
      }),
    );
    renderApp("/admin");
    expect(await screen.findByRole("heading", { level: 1, name: en["page.notFound.title"] })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: en["admin.nav"] })).not.toBeInTheDocument();
    expect(adminCalls).toBe(0);
  });
});
