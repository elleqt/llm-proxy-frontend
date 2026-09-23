export interface Snippets {
  claudeCode: string;
  omp: string;
  curlModels: string;
  curlChat: string;
}

/**
 * The instruction blocks, every address derived from the deployment's
 * `apiBaseURL`: Claude Code speaks the Anthropic API at the base itself (it
 * appends `/v1/messages`); omp and curl use the OpenAI-compatible API under `/v1`.
 */
export function snippets(apiBaseURL: string, key: string, model: string): Snippets {
  const base = apiBaseURL.replace(/\/+$/, "");
  return {
    claudeCode: [`export ANTHROPIC_BASE_URL="${base}"`, `export ANTHROPIC_AUTH_TOKEN="${key}"`, "claude"].join("\n"),
    omp: [
      "providers:",
      "  llm-proxy:",
      `    baseUrl: ${base}/v1`,
      `    apiKey: "${key}"`,
      "    api: openai-completions",
      "    discovery:",
      "      type: openai-models-list",
    ].join("\n"),
    curlModels: [`curl ${base}/v1/models \\`, `  -H "Authorization: Bearer ${key}"`].join("\n"),
    curlChat: [
      `curl ${base}/v1/chat/completions \\`,
      `  -H "Authorization: Bearer ${key}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello"}]}'`,
    ].join("\n"),
  };
}
