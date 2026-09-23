// Image build step: puts the CSP hash of the pre-paint script into the nginx
// config. The hash is taken from the built index.html, byte for byte what the
// browser hashes, so it cannot drift from the script it allows.
//
//   node nginx/csp-hash.mjs <index.html> <template in> <template out>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const PLACEHOLDER = "__PREPAINT_SCRIPT_HASH__";
const [html, templateIn, templateOut] = process.argv.slice(2);
if (templateOut === undefined) {
  console.error("usage: csp-hash.mjs <index.html> <template in> <template out>");
  process.exit(2);
}

// Every <script> without a src is inline; the CSP allows exactly one.
const inline = [...readFileSync(html, "utf8").matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (inline.length !== 1) {
  console.error(`${html}: expected exactly one inline script, found ${inline.length}`);
  process.exit(1);
}
const hash = `sha256-${createHash("sha256").update(inline[0][1], "utf8").digest("base64")}`;

const template = readFileSync(templateIn, "utf8");
if (!template.includes(PLACEHOLDER)) {
  console.error(`${templateIn}: no ${PLACEHOLDER} to replace`);
  process.exit(1);
}
writeFileSync(templateOut, template.replaceAll(PLACEHOLDER, hash));
console.log(hash);
