import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { fill } from "../../shared/lib/template";
import { renderApp } from "../../test/render";
import { fixtures, http, server, type Schemas } from "../../test/server";

/** A signed-in user whose cabinet lists `providers`; returns how often the list was asked for. */
function cabinet(me: Schemas["Me"], providers: Schemas["Catalog"]["providers"]) {
  const asked = { models: 0 };
  server.use(
    http.get("/api/me", ({ response }) => response(200).json(me)),
    http.get("/api/me/tokens", ({ response }) => response(200).json([])),
    http.get("/api/me/usage", ({ response }) => response(200).json(fixtures.usage())),
    http.get("/api/auth/config", ({ response }) =>
      response(200).json({ localLogin: false, oidc: { enabled: true, displayName: "Example ID" } }),
    ),
    http.get("/api/me/models", ({ response }) => {
      asked.models += 1;
      return response(200).json({ providers });
    }),
  );
  return asked;
}

async function section() {
  return within(await screen.findByRole("region", { name: en["models.title"] }));
}

describe("available models", () => {
  it("lists the models by provider in the server's order, with counts, under the rules and their source", async () => {
    cabinet(fixtures.me({ policy: ["chatgpt:*", "claude:claude-sonnet-*"], policySource: "idp" }), [
      { name: "chatgpt", models: ["gpt-6", "gpt-6-mini", "o5"] },
      { name: "claude", models: ["claude-sonnet-5"] },
    ]);
    renderApp("/");
    const models = await section();

    expect(await models.findByText(fill(en["models.rulesIdp"], { provider: "Example ID" }))).toBeInTheDocument();
    expect(within(models.getByRole("list", { name: en["models.rules"] })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "chatgpt:*",
      "claude:claude-sonnet-*",
    ]);
    const headings = await models.findAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["chatgpt3", "claude1"]);
    const chatgpt = within(models.getByRole("region", { name: "chatgpt3" }));
    expect(chatgpt.getAllByRole("code").map((code) => code.textContent)).toEqual(["gpt-6", "gpt-6-mini", "o5"]);
  });

  it("says a local policy is set by an administrator", async () => {
    cabinet(fixtures.me({ policy: ["claude:*"], policySource: "local" }), [{ name: "claude", models: ["claude-sonnet-5"] }]);
    renderApp("/");

    expect((await section()).getByText(en["models.rulesLocal"])).toBeInTheDocument();
  });

  it("copies a model id", async () => {
    cabinet(fixtures.me(), [{ name: "chatgpt", models: ["gpt-6", "gpt-6-mini"] }]);
    const user = userEvent.setup();
    renderApp("/");
    const models = await section();

    await user.click(await models.findByRole("button", { name: fill(en["models.copy"], { model: "gpt-6-mini" }) }));

    await expect(navigator.clipboard.readText()).resolves.toBe("gpt-6-mini");
    expect(models.getByRole("status")).toHaveTextContent(fill(en["models.copied"], { model: "gpt-6-mini" }));
  });

  it("asks again when the user is fetched again: the rules may have changed", async () => {
    const asked = cabinet(fixtures.me(), [{ name: "claude", models: ["claude-sonnet-5"] }]);
    const { queryClient } = renderApp("/");
    await (await section()).findByText("claude-sonnet-5");
    const before = asked.models;

    await queryClient.refetchQueries({ queryKey: ["me"] });

    await waitFor(() => expect(asked.models).toBeGreaterThan(before));
  });
});
