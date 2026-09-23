export interface Snippets {
  claudeCode: string;
  omp: string;
  curlModels: string;
  curlChat: string;
}

/**
 * omp's built-in providers pointed at the proxy, keyed by the gateway's
 * provider name (as in `/api/me/models`). omp keeps its own model list and
 * features; only the address and the key change.
 */
const OMP_PROVIDERS: Record<string, (base: string, key: string) => string[]> = {
  claude: (base, key) => [
    "  anthropic:",
    `    baseUrl: ${base}`,
    `    apiKey: "${key}"`,
    "    api: anthropic-messages",
    "    authHeader: true",
    "    compat:",
    "      supportsEagerToolInputStreaming: true",
  ],
  chatgpt: (base, key) => ["  openai-codex:", `    baseUrl: ${base}/backend-api`, `    apiKey: "${key}"`, "    authHeader: true"],
};

/**
 * The instruction blocks, every address derived from the deployment's
 * `apiBaseURL`: Claude Code and omp's Anthropic provider speak the Anthropic
 * API at the base itself, omp's Codex provider the ChatGPT backend API under
 * `/backend-api`, curl the OpenAI-compatible API under `/v1`.
 *
 * `providers` are the gateway providers the user may use; omp gets a block for
 * each it has one for, or every block when that leaves none (a list not loaded
 * yet, or empty).
 */
export function snippets(apiBaseURL: string, key: string, model: string, providers: readonly string[] = []): Snippets {
  const base = apiBaseURL.replace(/\/+$/, "");
  // In this file's order (anthropic first, as in a hand-written config), not the list's.
  const known = Object.keys(OMP_PROVIDERS);
  const usable = known.filter((name) => providers.includes(name));
  const omp = (usable.length > 0 ? usable : known).flatMap((name) => OMP_PROVIDERS[name]!(base, key));
  return {
    claudeCode: [`export ANTHROPIC_BASE_URL="${base}"`, `export ANTHROPIC_AUTH_TOKEN="${key}"`, "claude"].join("\n"),
    omp: ["providers:", ...omp].join("\n"),
    curlModels: [`curl ${base}/v1/models \\`, `  -H "Authorization: Bearer ${key}"`].join("\n"),
    curlChat: [
      `curl ${base}/v1/chat/completions \\`,
      `  -H "Authorization: Bearer ${key}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello"}]}'`,
    ].join("\n"),
  };
}
