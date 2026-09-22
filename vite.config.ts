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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [prepaintPlugin(), react()],
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
