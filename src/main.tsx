// Global styles first, so every component's CSS module comes after them in the bundle.
import "./shared/styles/tokens.css";
import "./shared/styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { App } from "./app/App";
import { createQueryClient } from "./app/queryClient";
import { routes } from "./app/routes";

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
const queryClient = createQueryClient((to) => void router.navigate(to, { replace: true }));

const root = document.getElementById("root");
if (root === null) throw new Error("#root is missing from index.html");

// `VITE_MOCK_API=1 npm run dev`: an in-browser stand-in for the backend. The
// `DEV` check is a build-time constant, so production bundles drop the import.
const mockApi =
  import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1"
    ? import("./mocks/browser").then(({ startMockApi }) => startMockApi())
    : Promise.resolve();

void mockApi.then(() =>
  createRoot(root).render(
    <StrictMode>
      <App router={router} queryClient={queryClient} />
    </StrictMode>,
  ),
);
