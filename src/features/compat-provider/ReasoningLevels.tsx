import { useEffect, useId, useState } from "react";
import { useT, type MessageKey } from "../../shared/i18n";
import { Badge, Button, TextField } from "../../shared/ui";
import { KNOWN_LEVELS, LEVEL_PATTERN, levelsKind, type LevelsKind } from "./levels";
import styles from "./ReasoningLevels.module.css";

export interface ReasoningLevelsProps {
  /** The provider's list; `null` while its models have different lists (nothing checked). */
  value: string[] | null;
  /** The server's default set. */
  defaults: readonly string[];
  /** More levels to offer as chips, e.g. the stored models' own values while their lists differ. */
  offered?: readonly string[];
  onChange: (list: string[]) => void;
  /** Already-translated error, e.g. an empty list refused on save. */
  error?: string | undefined;
}

/**
 * The `reasoning_effort` values an OpenAI-compatible provider's models pass to the vendor
 * unchanged: one list for the provider, as toggle chips. Reset returns to the default set.
 */
export function ReasoningLevels({ value, defaults, offered = [], onChange, error }: ReasoningLevelsProps) {
  const t = useT();
  const headingId = useId();
  const tipId = useId();
  // Own values typed here stay on offer once unchecked, until the drawer closes.
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);
  const checked = value ?? [];
  const options = [...new Set([...KNOWN_LEVELS, ...defaults, ...offered, ...checked, ...added])];
  const kind = levelsKind(value, defaults);

  const add = () => {
    const level = typed.trim().toLowerCase();
    if (level === "") return;
    if (!LEVEL_PATTERN.test(level)) {
      setInvalid(true);
      return;
    }
    if (!options.includes(level)) setAdded((current) => [...current, level]);
    // The checked levels in the order they are offered.
    onChange([...options.filter((l) => l === level || checked.includes(l)), ...(options.includes(level) ? [] : [level])]);
    setTyped("");
    setAdding(false);
  };

  return (
    <section className={styles.levels} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <h4 id={headingId} className={styles.title}>
          {t("compat.levels")}
        </h4>
        <HelpTip id={tipId} />
        <Badge tone={kind === "own" ? "accent" : "muted"}>{t(LEVELS_MARK[kind])}</Badge>
      </div>
      <div className={styles.chips} role="group" aria-labelledby={headingId}>
        {options.map((level) => (
          <button
            key={level}
            type="button"
            className={styles.chip}
            aria-pressed={checked.includes(level)}
            // The checked levels in the order they are offered.
            onClick={() => onChange(options.filter((l) => (l === level) !== checked.includes(l)))}
          >
            {level}
          </button>
        ))}
        {!adding && (
          <button type="button" className={`${styles.chip} ${styles.addChip}`} onClick={() => setAdding(true)}>
            + {t("compat.levelsAdd")}
          </button>
        )}
      </div>
      {adding && (
        <div className={styles.row}>
          <TextField
            label={t("compat.levelsAdd")}
            value={typed}
            mono
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setTyped(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              } else if (event.key === "Escape") {
                // Closes the field, not the drawer.
                event.preventDefault();
                setAdding(false);
                setTyped("");
                setInvalid(false);
              }
            }}
            error={invalid ? t("compat.levelsInvalid") : undefined}
          />
          <Button onClick={add} disabled={typed.trim() === ""}>
            {t("compat.levelsAddButton")}
          </Button>
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p className={styles.hint}>
        {t("compat.levelsAll")}{" "}
        <button
          type="button"
          className={styles.link}
          onClick={() => onChange([...defaults])}
          disabled={kind === "default"}
          title={t("compat.levelsResetHint")}
        >
          {t("compat.levelsReset")}
        </button>
      </p>
    </section>
  );
}

/** The badge of a provider list: the default set, an own list, or models that differ. */
export const LEVELS_MARK = {
  default: "compat.levelsDefault",
  own: "compat.levelsOwn",
  mixed: "compat.levelsMixed",
} as const satisfies Record<LevelsKind, MessageKey>;

/**
 * The "?" beside the heading: the long explanation as a tooltip that opens on hover, on
 * focus and on click (which pins it). Escape closes an open tip, wherever focus is, and
 * only the tip: the drawer stays.
 */
function HelpTip({ id }: { id: string }) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hovered || focused || pinned);
  useEffect(() => {
    if (!open) return;
    // Capture on the document runs before the drawer's own Escape handler.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPinned(false);
      setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);
  return (
    <span
      className={styles.tip}
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={styles.help}
        aria-label={t("compat.levelsHelp")}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
          setDismissed(false);
        }}
        onClick={() => {
          // A click pins an open tip, or closes a pinned one.
          setPinned(!(open && pinned));
          setDismissed(open && pinned);
        }}
      >
        ?
      </button>
      <span id={id} role="tooltip" className={styles.tipBox} data-open={open || undefined}>
        {/* The hint marks values as `code`. */}
        {t("compat.levelsHint")
          .split("`")
          .map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}
      </span>
    </span>
  );
}
