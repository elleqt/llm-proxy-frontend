import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderApp } from "../../test/render";
import { fixtures, http, server } from "../../test/server";

describe("/connect without a key issued in this tab", () => {
  it("builds every block from apiBaseURL, with a placeholder and a way to issue a key", async () => {
    server.use(
      http.get("/api/me", ({ response }) => response(200).json(fixtures.me())),
      http.get("/api/config", ({ response }) => response(200).json(fixtures.config({ apiBaseURL: "https://llm.example.com" }))),
    );
    renderApp("/connect");

    const key = en["connect.keyPlaceholder"];
    const claude = await screen.findByText(/ANTHROPIC_BASE_URL/);
    expect(claude).toHaveTextContent(`export ANTHROPIC_BASE_URL="https://llm.example.com"`);
    expect(claude).toHaveTextContent(`export ANTHROPIC_AUTH_TOKEN="${key}"`);
    // The standing /api/me/models answer allows only claude: omp gets only its Anthropic provider.
    const omp = await screen.findByText(/anthropic-messages/);
    expect(omp).toHaveTextContent(`apiKey: "${key}"`);
    await waitFor(() => expect(omp).not.toHaveTextContent("openai-codex"));
    expect(screen.getByText(/curl .*\/v1\/models/)).toHaveTextContent(
      `curl https://llm.example.com/v1/models \\ -H "Authorization: Bearer ${key}"`,
    );
    expect(screen.getByText(/chat\/completions/)).toHaveTextContent("curl https://llm.example.com/v1/chat/completions");
    expect(screen.getByRole("link", { name: en["issue.open"] })).toHaveAttribute("href", "/");
  });

  it("leaves out a provider whose models are all unpriced", async () => {
    server.use(
      http.get("/api/me", ({ response }) => response(200).json(fixtures.me())),
      http.get("/api/config", ({ response }) => response(200).json(fixtures.config({ apiBaseURL: "https://llm.example.com" }))),
      http.get("/api/me/models", ({ response }) =>
        response(200).json({
          providers: [
            { name: "chatgpt", models: [], unpriced: ["gpt-5"] },
            { name: "claude", models: ["claude-sonnet-5"] },
          ],
        }),
      ),
    );
    renderApp("/connect");

    const omp = await screen.findByText(/anthropic-messages/);
    await waitFor(() => expect(omp).not.toHaveTextContent("openai-codex"));
  });
});
