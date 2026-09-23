import { execFileSync } from "node:child_process";

/** Where the stack under test is and how to read its logs; set by scripts/e2e-stack.sh. */
export const stack = {
  /** The proxied LLM API, where issued keys are used. */
  apiURL: process.env.E2E_API_URL || "http://localhost:8080",
  adminEmail: process.env.E2E_ADMIN_EMAIL || "admin@example.com",
};

/**
 * The bootstrap administrator's temporary password, read from the banner the
 * backend prints once to its log. It is never written anywhere else.
 */
export function bootstrapPassword(): string {
  const project = process.env.E2E_COMPOSE_PROJECT;
  const files = (process.env.E2E_COMPOSE_FILES || "").split(":").filter(Boolean);
  if (!project || files.length === 0) {
    throw new Error("E2E_COMPOSE_PROJECT and E2E_COMPOSE_FILES must name the running compose stack");
  }
  const args = ["compose", "-p", project, ...files.flatMap((file) => ["-f", file])];
  const logs = execFileSync("docker", [...args, "logs", "--no-color", "--no-log-prefix", "backend"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const found = [...logs.matchAll(/^\s*temporary password:\s*(\S+)\s*$/gm)];
  if (found.length !== 1) {
    throw new Error(`expected one bootstrap password in the backend log, found ${found.length}`);
  }
  return found[0][1];
}
