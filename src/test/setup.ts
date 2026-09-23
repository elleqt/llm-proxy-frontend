import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

// findBy* and waitFor return as soon as their condition holds; this is only how
// long they keep trying. The default second is not enough on a busy CI runner,
// where a render and a mocked response can take longer. Passing tests are not
// slowed; a real failure is reported a few seconds later.
configure({ asyncUtilTimeout: 5000 });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  for (const name of ["data-theme", "data-lang", "lang"]) document.documentElement.removeAttribute(name);
});
afterAll(() => server.close());
