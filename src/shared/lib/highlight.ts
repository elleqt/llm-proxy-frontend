import Prism, { type Grammar } from "prismjs";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-diff";

function grammar(name: string): Grammar {
  const found = Prism.languages[name];
  if (found === undefined) throw new Error(`highlight: Prism has no ${name} grammar`);
  return found;
}

const YAML = grammar("yaml");
const DIFF = grammar("diff");

// Prism's output is escaped text and `<span class="…">` / `</span>` tags only.
const BREAK_OR_TAG = /\n|<span[^>]*>|<\/span>/g;

/**
 * Prism's HTML for YAML, one string per source line. A token that spans a
 * line break (a block scalar, say) is closed at the end of each line and
 * reopened on the next, so every line is well-formed on its own. Prism
 * escapes the source, so the result is safe to put into the DOM.
 */
export function highlightYamlLines(code: string): string[] {
  const html = Prism.highlight(code, YAML, "yaml");
  const lines: string[] = [];
  const open: string[] = [];
  let line = "";
  let from = 0;
  for (const match of html.matchAll(BREAK_OR_TAG)) {
    const piece = match[0];
    line += html.slice(from, match.index);
    from = match.index + piece.length;
    if (piece === "\n") {
      lines.push(line + "</span>".repeat(open.length));
      line = open.join("");
    } else {
      if (piece === "</span>") open.pop();
      else open.push(piece);
      line += piece;
    }
  }
  lines.push(line + html.slice(from));
  return lines;
}

/** Prism's HTML for a unified diff; escaped like {@link highlightYamlLines}. */
export function highlightDiff(text: string): string {
  return Prism.highlight(text, DIFF, "diff");
}
