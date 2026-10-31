import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderWithClient } from "../../test/render";
import { CompatHeaders } from "./CompatHeaders";
import type { HeadersDraft } from "./headers";

function Editor() {
  const [draft, setDraft] = useState<HeadersDraft>({ mode: "keep" });
  return <CompatHeaders draft={draft} names={["x-stored"]} onChange={setDraft} />;
}

describe("CompatHeaders", () => {
  it("preserves the remaining row's values when an earlier row is removed", async () => {
    renderWithClient(<Editor />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en["compat.headersReplace"] }));
    await user.type(screen.getByLabelText(`${en["compat.headerName"]} 1`), "x-first");
    await user.type(screen.getByLabelText(`${en["compat.headerValue"]} 1`), "first-secret");
    await user.click(screen.getByRole("button", { name: en["compat.headerAdd"] }));
    await user.type(screen.getByLabelText(`${en["compat.headerName"]} 2`), "x-second");
    await user.type(screen.getByLabelText(`${en["compat.headerValue"]} 2`), "second-secret");
    await user.click(screen.getByRole("button", { name: `${en["compat.headerRemove"]} 1` }));
    expect(screen.getByLabelText(`${en["compat.headerName"]} 1`)).toHaveValue("x-second");
    expect(screen.getByLabelText(`${en["compat.headerValue"]} 1`)).toHaveValue("second-secret");
  });

  it("undoes removal without asking for stored secret values", async () => {
    renderWithClient(<Editor />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en["compat.headersRemove"] }));
    expect(screen.getByText(en["compat.headersCleared"])).toBeVisible();
    await user.click(screen.getByRole("button", { name: en["compat.headersUndo"] }));
    expect(screen.getByText("x-stored")).toBeVisible();
    expect(screen.getByRole("button", { name: en["compat.headersReplace"] })).toHaveFocus();
    expect(screen.queryByLabelText(`${en["compat.headerValue"]} 1`)).toBeNull();
  });
});
