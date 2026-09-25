import { useEffect, useState } from "react";
import type * as HighlightModule from "../lib/highlight";

type Highlighter = typeof HighlightModule;

// Prism's own escaping: the text becomes HTML text content.
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/** Uncolored stand-in, with the same shape, while Prism's chunk loads. */
const PLAIN: Highlighter = {
  highlightYamlLines: (code) => escape(code).split("\n"),
  highlightDiff: escape,
};

let loaded: Highlighter | null = null;

/**
 * Prism's highlighting, loaded in its own chunk on first use so the pages that
 * never show code do not carry it. Until it arrives, and for good if its chunk
 * is gone (a tab opened before a redeploy), the text shows uncolored.
 */
export function useHighlighter(): Highlighter {
  const [highlighter, setHighlighter] = useState(loaded);
  useEffect(() => {
    if (highlighter !== null) return;
    let cancelled = false;
    void import("../lib/highlight").then(
      (module) => {
        loaded = module;
        if (!cancelled) setHighlighter(module);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [highlighter]);
  return highlighter ?? PLAIN;
}
