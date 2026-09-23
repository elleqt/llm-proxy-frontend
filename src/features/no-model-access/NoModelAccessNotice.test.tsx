import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { fill } from "../../shared/lib/template";
import { renderApp } from "../../test/render";
import { fixtures, http, server, type Schemas } from "../../test/server";

function signedIn(me: Schemas["Me"], oidcName?: string) {
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(me)),
    http.get("/api/me/tokens", ({ response }) => response(200).json([])),
    http.get("/api/me/usage", ({ response }) => response(200).json(fixtures.usage())),
    http.get("/api/connect", ({ response }) => response(200).json({ apiBaseURL: "https://llm.example.com" })),
    http.get("/api/auth/config", ({ response }) =>
      response(200).json({
        localLogin: false,
        oidc: oidcName === undefined ? { enabled: true } : { enabled: true, displayName: oidcName },
      }),
    ),
  );
}

async function pageShown(path: string, heading: string) {
  renderApp(path);
  await screen.findByRole("heading", { level: 1, name: heading });
}

describe("the no-model-access notice", () => {
  it("tells a user whose groups grant nothing to ask for a group in the named provider, on /connect", async () => {
    signedIn(fixtures.me({ policy: [], policySource: "idp" }), "Example ID");
    await pageShown("/connect", en["page.connect.title"]);

    const notice = await screen.findByText(new RegExp(fill(en["access.askIdp"], { provider: "Example ID" })));
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(en["access.none"]);
    expect(notice).not.toHaveTextContent(en["access.askAdmin"]);
  });

  it("names the identity provider generically when it has no display name", async () => {
    signedIn(fixtures.me({ policy: [], policySource: "idp" }));
    await pageShown("/", en["page.cabinet.title"]);

    expect(await screen.findByText(new RegExp(en["access.none"]))).toHaveTextContent(
      fill(en["access.askIdp"], { provider: en["access.providerFallback"] }),
    );
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

  it("is absent when the policy allows some model", async () => {
    signedIn(fixtures.me({ policy: ["chatgpt:*"], policySource: "idp" }), "Example ID");
    await pageShown("/connect", en["page.connect.title"]);
    await pageShown("/", en["page.cabinet.title"]);

    expect(screen.queryByText(new RegExp(en["access.none"]))).not.toBeInTheDocument();
  });
});
