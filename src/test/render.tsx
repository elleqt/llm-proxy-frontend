import { render } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { App } from "../app/App";
import { createQueryClient } from "../app/queryClient";
import { routes } from "../app/routes";

/** Renders the whole application at `path`, the way main.tsx wires it. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient((to) => void router.navigate(to, { replace: true }));
  // Same retry policy as the application, without the waiting.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } });
  const view = render(<App router={router} queryClient={queryClient} />);
  return { ...view, router, queryClient };
}
