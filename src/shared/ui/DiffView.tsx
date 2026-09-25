import { CopyButton } from "./CopyButton";
import styles from "./DiffView.module.css";
import { useHighlighter } from "./useHighlighter";

export interface DiffViewProps {
  /** A unified diff. */
  text: string;
}

/** A unified diff with removals and additions colored, and a button that copies it verbatim. */
export function DiffView({ text }: DiffViewProps) {
  const { highlightDiff } = useHighlighter();
  return (
    <div className={styles.view}>
      <CopyButton value={text} />
      <pre className={styles.diff} dangerouslySetInnerHTML={{ __html: highlightDiff(text) }} />
    </div>
  );
}
