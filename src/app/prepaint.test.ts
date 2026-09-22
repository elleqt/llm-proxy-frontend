import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createServer } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

// The script under test is taken from index.html as Vite serves it, i.e. after
// the `transformIndexHtml` hook in vite.config.ts inlined src/app/prepaint.ts —
// the code the browser runs, not a separate import of the module.
let head: HTMLHeadElement;
let script: string;

beforeAll(async () => {
  const server = await createServer({ logLevel: "silent", server: { middlewareMode: true } });
  try {
    const html = await server.transformIndexHtml("/", readFileSync("index.html", "utf8"));
    head = new DOMParser().parseFromString(html, "text/html").head;
  } finally {
    await server.close();
  }
  script = head.querySelector("script:not([src])")?.textContent ?? "";
});

/**
 * Runs the page's pre-paint script in a bare context holding only a fake
 * `document` and the given `localStorage` (a getter, so it can throw on access).
 */
function prepaint(localStorage: () => Pick<Storage, "getItem">): Record<string, string> {
  const attributes: Record<string, string> = {};
  const context = {
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    },
  };
  Object.defineProperty(context, "localStorage", { get: localStorage });
  runInNewContext(script, context);
  return attributes;
}

const stored = (values: Record<string, string>) => () => ({
  getItem: (key: string) => values[key] ?? null,
});

const defaults = { "data-theme": "auto", "data-lang": "en", lang: "en" };

describe("pre-paint script", () => {
  it("is the first element of <head>, an inline classic script ahead of every stylesheet and module", () => {
    const first = head.firstElementChild;
    expect(first?.tagName).toBe("SCRIPT");
    expect(first?.hasAttribute("src")).toBe(false);
    expect(first?.hasAttribute("type")).toBe(false);
    expect(first?.textContent).toBe(script);
  });

  it("applies valid stored values", () => {
    expect(prepaint(stored({ theme: "pink", lang: "ru" }))).toEqual({
      "data-theme": "pink",
      "data-lang": "ru",
      lang: "ru",
    });
  });

  it("replaces invalid stored values with the defaults, each on its own", () => {
    expect(prepaint(stored({ theme: "neon", lang: "de" }))).toEqual(defaults);
    expect(prepaint(stored({ theme: "dark", lang: "xx" }))).toEqual({ ...defaults, "data-theme": "dark" });
  });

  it("uses the defaults when nothing is stored", () => {
    expect(prepaint(stored({}))).toEqual(defaults);
  });

  it("uses the defaults when reading storage throws", () => {
    const throwing = () => ({
      getItem: (): string | null => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(prepaint(throwing)).toEqual(defaults);
  });

  it("uses the defaults when touching localStorage at all throws", () => {
    const inaccessible = () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(prepaint(inaccessible)).toEqual(defaults);
  });
});
