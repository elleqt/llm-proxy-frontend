import { useState, type ReactNode } from "react";
import styles from "./Table.module.css";

export type SortValue = string | number | null;

export interface Column<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Makes the column sortable by this key. `null` sorts last in both directions. */
  sortValue?: (row: Row) => SortValue;
  align?: "start" | "end";
  /** Monospace cells: token prefixes, model ids. */
  mono?: boolean;
}

export interface TableProps<Row> {
  /** Accessible name of the table, rendered as a visually hidden caption. */
  label: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}

type Direction = "ascending" | "descending";
interface Sort {
  column: string;
  direction: Direction;
}

/** none → ascending → descending → none */
function nextSort(current: Sort | null, column: string): Sort | null {
  if (current?.column !== column) return { column, direction: "ascending" };
  return current.direction === "ascending" ? { column, direction: "descending" } : null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

export function Table<Row>({ label, columns, rows, rowKey }: TableProps<Row>) {
  const [sort, setSort] = useState<Sort | null>(null);

  const sortColumn = sort && columns.find((column) => column.id === sort.column);
  let shown = rows;
  if (sort && sortColumn?.sortValue) {
    const value = sortColumn.sortValue;
    const sign = sort.direction === "ascending" ? 1 : -1;
    shown = [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      return sign * compare(va, vb);
    });
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const alignClass = column.align === "end" ? styles.end : undefined;
              if (!column.sortValue) {
                return (
                  <th key={column.id} scope="col" className={alignClass}>
                    {column.header}
                  </th>
                );
              }
              const direction = sort?.column === column.id ? sort.direction : "none";
              return (
                <th key={column.id} scope="col" aria-sort={direction} className={alignClass}>
                  <button type="button" className={styles.sort} onClick={() => setSort(nextSort(sort, column.id))}>
                    {column.header}
                    <span className={styles.arrow} aria-hidden="true">
                      {direction === "ascending" ? "▲" : direction === "descending" ? "▼" : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={[column.align === "end" && styles.end, column.mono && styles.mono].filter(Boolean).join(" ") || undefined}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
