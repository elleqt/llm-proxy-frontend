import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  items: readonly TabItem[];
  /** Controlled selection; uncontrolled (starting at the first tab) when omitted. */
  value?: string;
  onChange?: (id: string) => void;
}

/**
 * WAI-ARIA tabs with automatic activation: arrows, Home and End move focus and
 * selection together; only the selected tab is in the Tab sequence.
 */
export function Tabs({ label, items, value, onChange }: TabsProps) {
  const baseId = useId();
  const [own, setOwn] = useState(items[0]?.id);
  const selected = value ?? own;
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = (id: string) => {
    setOwn(id);
    onChange?.(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === selected);
    const last = items.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = index >= last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index <= 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    const target = items[next];
    if (!target) return;
    event.preventDefault();
    select(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const current = items.find((item) => item.id === selected);
  const panelId = `${baseId}-panel`;

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {items.map((item) => {
          const isSelected = item.id === selected;
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) tabRefs.current.set(item.id, node);
                else tabRefs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={isSelected ? panelId : undefined}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {current && (
        <div role="tabpanel" id={panelId} aria-labelledby={`${baseId}-tab-${current.id}`} tabIndex={0} className={styles.panel}>
          {current.content}
        </div>
      )}
    </div>
  );
}
