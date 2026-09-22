import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("schema.d.ts is what `npm run gen:api` generates from api/openapi.yaml", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-api-"));
  try {
    const regenerated = join(dir, "schema.d.ts");
    // The same CLI and arguments as the gen:api script, only a different output path.
    execFileSync(
      process.execPath,
      ["node_modules/openapi-typescript/bin/cli.js", "api/openapi.yaml", "-o", regenerated],
      { stdio: "pipe" },
    );
    const committed = readFileSync("src/shared/api/schema.d.ts", "utf8");
    // Not toEqual on the whole text: a 1500-line diff is unreadable; say what to run.
    expect(readFileSync(regenerated, "utf8") === committed, "schema.d.ts is stale; run `npm run gen:api`").toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
