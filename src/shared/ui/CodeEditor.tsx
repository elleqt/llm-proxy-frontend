import { useMemo } from "react";
import { useHighlighter } from "./useHighlighter";
import styles from "./CodeEditor.module.css";

export interface CodeEditorProps {
  /** The text area's id, for a `<label htmlFor>` outside. */
  id: string;
  value: string;
  /** Id of the element describing the text area. */
  describedBy: string;
  onChange: (value: string) => void;
}

/**
 * A YAML text area with highlighting and line numbers. The text area stays the
 * real control (label, keyboard, undo, selection); its own text is transparent
 * over an aria-hidden copy that Prism colors, laid out with the same metrics so
 * the caret lands on the colored text. Line numbers exist only in that copy,
 * never in the value.
 */
export function CodeEditor({ id, value, describedBy, onChange }: CodeEditorProps) {
  const { highlightYamlLines } = useHighlighter();
  const html = useMemo(
    () =>
      highlightYamlLines(value)
        .map((line, i) => `<span class="${styles.line}"><span class="${styles.lineNo}">${i + 1}</span>${line}\n</span>`)
        .join(""),
    [highlightYamlLines, value],
  );
  return (
    <div className={styles.editor}>
      <div className={styles.stack}>
        <pre aria-hidden="true" className={styles.highlight} dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          id={id}
          value={value}
          aria-describedby={describedBy}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={styles.input}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
