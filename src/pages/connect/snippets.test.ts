import { describe, expect, it } from "vitest";
import { snippets } from "./snippets";

const ANTHROPIC = [
  "  anthropic:",
  "    baseUrl: https://proxy.example",
  '    apiKey: "sk-test"',
  "    api: anthropic-messages",
  "    authHeader: true",
  "    compat:",
  "      supportsEagerToolInputStreaming: true",
].join("\n");

const OPENAI_CODEX = [
  "  openai-codex:",
  "    baseUrl: https://proxy.example/backend-api",
  '    apiKey: "sk-test"',
  "    authHeader: true",
].join("\n");

const omp = (providers?: string[]) => snippets("https://proxy.example/", "sk-test", "<model-id>", providers).omp;

describe("the omp config", () => {
  it("overrides omp's built-in providers exactly as a working config does", () => {
    expect(omp(["chatgpt", "claude"])).toBe(`providers:\n${OPENAI_CODEX}\n${ANTHROPIC}`);
  });

  it("offers only the providers the user may use", () => {
    expect(omp(["claude"])).toBe(`providers:\n${ANTHROPIC}`);
    expect(omp(["chatgpt"])).toBe(`providers:\n${OPENAI_CODEX}`);
  });

  it("offers both while the list is unknown or holds nothing omp has a provider for", () => {
    const both = `providers:\n${ANTHROPIC}\n${OPENAI_CODEX}`;
    expect(omp()).toBe(both);
    expect(omp([])).toBe(both);
    expect(omp(["gemini"])).toBe(both);
  });
});
