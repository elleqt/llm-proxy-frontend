import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { App } from "./app/App";
import { createQueryClient } from "./app/queryClient";
import { routes } from "./app/routes";
import "./shared/styles/tokens.css";
import "./shared/styles/base.css";

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
const queryClient = createQueryClient((to) => void router.navigate(to, { replace: true }));

const root = document.getElementById("root");
if (root === null) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
);
