import { describe, expect, it } from "vitest";
import { highlightDiff, highlightYamlLines } from "./highlight";

function parse(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("highlightYamlLines", () => {
  it("gives every source line a well-formed line of its own, even inside a token spanning lines", () => {
    const code = 'proxy-url: "http://example.com"\nnote: |\n  a <b> & c\n  d\nrequest-retry: 3\n';

    const lines = highlightYamlLines(code);

    expect(lines.map((line) => parse(line).textContent)).toEqual(code.split("\n"));
    for (const line of lines) {
      expect(line.split("<span").length).toBe(line.split("</span>").length);
    }
    // The block scalar's second line is still colored as a string.
    expect(parse(lines[3] ?? "").querySelector(".token.string")?.textContent).toBe("  d");
  });

  it("marks keys and values with the classes the editor colors", () => {
    const line = parse(highlightYamlLines("request-retry: 3")[0] ?? "");

    expect(line.querySelector(".token.key")?.textContent).toBe("request-retry");
    expect(line.querySelector(".token.number")?.textContent).toBe("3");
  });
});

describe("highlightDiff", () => {
  it("marks removed and added lines with the classes the diff view colors", () => {
    const diff = parse(highlightDiff("@@ -1 +1 @@\n-request-retry: 3\n+request-retry: 5\n"));

    expect(diff.querySelector(".token.coord")?.textContent).toBe("@@ -1 +1 @@");
    expect(diff.querySelector(".token.deleted")?.textContent).toBe("-request-retry: 3\n");
    expect(diff.querySelector(".token.inserted")?.textContent).toBe("+request-retry: 5\n");
  });
});
