import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { PREPAINT_SCRIPT } from "./src/app/prepaint.ts";

// Theme and language must be on <html> before the first stylesheet applies,
// so the script goes first in <head>, inline, ahead of any module.
function prepaintPlugin(): Plugin {
  return {
    name: "llm-proxy:prepaint",
    transformIndexHtml: () => [{ tag: "script", children: PREPAINT_SCRIPT, injectTo: "head-prepend" }],
  };
}

// `VITE_MOCK_API=1 npm run dev` only: serves MSW's service worker from
// node_modules, so it never lands in public/ and never in a build.
function mockWorkerPlugin(): Plugin {
  return {
    name: "llm-proxy:mock-worker",
    apply: "serve",
    configureServer(server) {
      const worker = readFileSync(createRequire(import.meta.url).resolve("msw/mockServiceWorker.js"));
      server.middlewares.use("/mockServiceWorker.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        response.end(worker);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [prepaintPlugin(), react(), ...(env.VITE_MOCK_API === "1" ? [mockWorkerPlugin()] : [])],
    server: {
      proxy: {
        "/api": { target: env.VITE_BACKEND_ORIGIN || "http://localhost:8080" },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["src/test/setup.ts"],
      restoreMocks: true,
    },
  };
});
