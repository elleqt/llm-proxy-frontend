import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Table, type Column } from "./Table";

interface Key {
  id: string;
  label: string;
  uses: number | null;
}

const rows: Key[] = [
  { id: "1", label: "laptop", uses: 12 },
  { id: "2", label: "CI", uses: null },
  { id: "3", label: "desktop", uses: 3 },
];

const columns: Column<Key>[] = [
  { id: "label", header: "Label", cell: (row) => row.label, sortValue: (row) => row.label },
  { id: "uses", header: "Uses", cell: (row) => row.uses ?? "—", sortValue: (row) => row.uses },
  { id: "id", header: "Id", cell: (row) => row.id },
];

function labels(): string[] {
  const [, ...body] = screen.getAllByRole("row");
  return body.map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("Table", () => {
  it("is a table named by its label, with only sortable headers as buttons", () => {
    render(<Table label="API keys" columns={columns} rows={rows} rowKey={(row) => row.id} />);

    const table = screen.getByRole("table", { name: "API keys" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(table).getByRole("columnheader", { name: "Id" })).not.toHaveAttribute("aria-sort");
    expect(within(table).queryByRole("button", { name: "Id" })).not.toBeInTheDocument();
  });

  it("cycles a column through ascending, descending and unsorted", async () => {
    const user = userEvent.setup();
    render(<Table label="API keys" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const header = screen.getByRole("columnheader", { name: /Label/ });
    const sort = within(header).getByRole("button");

    expect(header).toHaveAttribute("aria-sort", "none");
    expect(labels()).toEqual(["laptop", "CI", "desktop"]);

    await user.click(sort);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(labels()).toEqual(["CI", "desktop", "laptop"]);

    await user.click(sort);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(labels()).toEqual(["laptop", "desktop", "CI"]);

    await user.click(sort);
    expect(header).toHaveAttribute("aria-sort", "none");
    expect(labels()).toEqual(["laptop", "CI", "desktop"]);
  });

  it("moves sorting to another column from the keyboard, keeping empty values last", async () => {
    const user = userEvent.setup();
    render(<Table label="API keys" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const label = screen.getByRole("columnheader", { name: /Label/ });
    const uses = screen.getByRole("columnheader", { name: /Uses/ });
    await user.click(within(label).getByRole("button"));

    within(uses).getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(uses).toHaveAttribute("aria-sort", "ascending");
    expect(label).toHaveAttribute("aria-sort", "none");
    expect(labels()).toEqual(["desktop", "laptop", "CI"]);

    await user.keyboard(" ");
    expect(uses).toHaveAttribute("aria-sort", "descending");
    expect(labels()).toEqual(["laptop", "desktop", "CI"]);
  });
});
