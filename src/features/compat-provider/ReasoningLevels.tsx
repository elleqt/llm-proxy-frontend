import { useId, useState } from "react";
import { useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Badge, Button, Checkbox, TextField } from "../../shared/ui";
import { KNOWN_LEVELS, LEVEL_PATTERN, levelsInput, sameLevels } from "./levels";
import styles from "./ReasoningLevels.module.css";

export interface ReasoningLevelsProps {
  model: string;
  /** The model's own list, or `null` while it follows the default set. */
  levels: string[] | null;
  /** The server's default set. */
  defaults: readonly string[];
  onChange: (levels: string[] | null) => void;
}

/**
 * The `reasoning_effort` values a compat model passes to its vendor unchanged. Checking
 * exactly the default set returns the model to it, so the request then carries no list.
 */
export function ReasoningLevels({ model, levels, defaults, onChange }: ReasoningLevelsProps) {
  const t = useT();
  const hintId = useId();
  // Own values typed here stay on offer once unchecked, until the form closes.
  const [added, setAdded] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);
  const checked = levels ?? defaults;
  const own = levelsInput(levels, defaults) !== undefined;
  const options = [...new Set([...KNOWN_LEVELS, ...defaults, ...checked, ...added])];

  // The checked levels in the order they are offered; the default set is stored as `null`.
  const check = (offered: string[], isChecked: (level: string) => boolean) => {
    const next = offered.filter(isChecked);
    onChange(sameLevels(next, defaults) ? null : next);
  };

  const add = () => {
    const level = typed.trim().toLowerCase();
    if (level === "") return;
    if (!LEVEL_PATTERN.test(level)) {
      setInvalid(true);
      return;
    }
    if (!options.includes(level)) setAdded((current) => [...current, level]);
    check(options.includes(level) ? options : [...options, level], (l) => l === level || checked.includes(l));
    setTyped("");
  };

  return (
    <fieldset className={styles.levels} aria-label={fill(t("compat.levelsFor"), { model })} aria-describedby={hintId}>
      <legend className={styles.legend}>
        {t("compat.levels")}{" "}
        <Badge tone={own ? "accent" : "muted"}>{own ? t("compat.levelsOwn") : t("compat.levelsDefault")}</Badge>
      </legend>
      <div className={styles.options}>
        {options.map((level) => (
          <Checkbox
            key={level}
            label={<span className={styles.mono}>{level}</span>}
            checked={checked.includes(level)}
            onChange={(event) => check(options, (l) => (l === level ? event.target.checked : checked.includes(l)))}
          />
        ))}
      </div>
      <div className={styles.row}>
        <TextField
          label={t("compat.levelsAdd")}
          value={typed}
          mono
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
            }
          }}
          error={invalid ? t("compat.levelsInvalid") : undefined}
        />
        <Button onClick={add} disabled={typed.trim() === ""}>
          {t("compat.levelsAddButton")}
        </Button>
        <Button onClick={() => onChange(null)} disabled={!own} title={t("compat.levelsResetHint")}>
          {t("compat.levelsReset")}
        </Button>
      </div>
      <p id={hintId} className={styles.hint}>
        {/* The hint marks values as `code`. */}
        {t("compat.levelsHint")
          .split("`")
          .map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}
      </p>
    </fieldset>
  );
}
