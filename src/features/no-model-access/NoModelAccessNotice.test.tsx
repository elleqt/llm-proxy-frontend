import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderApp } from "../../test/render";
import { fixtures, http, server, type Schemas } from "../../test/server";

function signedIn(me: Schemas["Me"]) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(me)),
    http.get("/api/me/tokens", ({ response }) => response(200).json([])),
    http.get("/api/me/usage", ({ response }) => response(200).json(fixtures.usage())),
    http.get("/api/connect", ({ response }) => response(200).json({ apiBaseURL: "https://llm.example.com" })),
  );
}

async function pageShown(path: string, heading: string) {
  renderApp(path);
  await screen.findByRole("heading", { level: 1, name: heading });
}

describe("the no-model-access notice", () => {
  it("tells a user whose groups grant nothing to ask for a group, on /connect", async () => {
    signedIn(fixtures.me({ policy: [], policySource: "idp" }));
    await pageShown("/connect", en["page.connect.title"]);

    const notice = await screen.findByText(new RegExp(en["access.none"]));
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(en["access.askIdp"]);
    expect(notice).not.toHaveTextContent(en["access.askAdmin"]);
  });

  it("tells a local account to ask an administrator, and still offers to issue a key", async () => {
    signedIn(fixtures.me({ policy: [], policySource: "local" }));
    await pageShown("/", en["page.cabinet.title"]);

    const notice = screen.getByText(new RegExp(en["access.none"]));
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(en["access.askAdmin"]);
    expect(notice).not.toHaveTextContent(/groups/);
    expect(await screen.findByRole("button", { name: en["issue.open"] })).toBeEnabled();
  });

  it("says the rules match nothing when they exist but no model is available, on both pages", async () => {
    signedIn(fixtures.me({ policy: ["mistral:*"], policySource: "local" }));
    server.use(http.get("/api/me/models", ({ response }) => response(200).json({ providers: [] })));
    await pageShown("/connect", en["page.connect.title"]);
    await pageShown("/", en["page.cabinet.title"]);

    const noMatch = new RegExp(en["access.noMatch"]);
    await waitFor(() => expect(screen.getAllByText(noMatch)).toHaveLength(2));
    for (const notice of screen.getAllByText(noMatch)) {
      expect(notice).toHaveAttribute("role", "status");
      expect(notice).toHaveTextContent(en["access.askCheck"]);
    }
  });

  it("is absent when the policy allows some model", async () => {
    signedIn(fixtures.me({ policy: ["chatgpt:*"], policySource: "idp" }));
    await pageShown("/connect", en["page.connect.title"]);
    await pageShown("/", en["page.cabinet.title"]);

    expect(screen.queryByText(new RegExp(en["access.none"]))).not.toBeInTheDocument();
  });
});
