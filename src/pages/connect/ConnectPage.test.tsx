import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderApp } from "../../test/render";
import { fixtures, http, server } from "../../test/server";

describe("/connect without a key issued in this tab", () => {
  it("builds every block from apiBaseURL, with a placeholder and a way to issue a key", async () => {
    server.use(
      http.get("/api/me", ({ response }) => response(200).json(fixtures.me())),
      http.get("/api/connect", ({ response }) => response(200).json({ apiBaseURL: "https://llm.example.com" })),
    );
    renderApp("/connect");

    const key = en["connect.keyPlaceholder"];
    const claude = await screen.findByText(/ANTHROPIC_BASE_URL/);
    expect(claude).toHaveTextContent(`export ANTHROPIC_BASE_URL="https://llm.example.com"`);
    expect(claude).toHaveTextContent(`export ANTHROPIC_AUTH_TOKEN="${key}"`);
    expect(screen.getByText(/openai-completions/)).toHaveTextContent("baseUrl: https://llm.example.com/v1");
    expect(screen.getByText(/curl .*\/v1\/models/)).toHaveTextContent(
      `curl https://llm.example.com/v1/models \\ -H "Authorization: Bearer ${key}"`,
    );
    expect(screen.getByText(/chat\/completions/)).toHaveTextContent("curl https://llm.example.com/v1/chat/completions");
    expect(screen.getByRole("link", { name: en["issue.open"] })).toHaveAttribute("href", "/");
    expect(screen.getByText(en["connect.trouble401"])).toBeInTheDocument();
    expect(screen.getByText(en["connect.trouble403"])).toBeInTheDocument();
  });
});
