import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Toggle } from "./Toggle";

function Harness() {
  const [on, setOn] = useState(false);
  return <Toggle label="Disable login form" checked={on} onChange={setOn} />;
}

describe("Toggle", () => {
  it("is a switch that Space and Enter turn on and off", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Disable login form" });

    await user.tab();
    expect(toggle).toHaveFocus();
    expect(toggle).not.toBeChecked();

    await user.keyboard(" ");
    expect(toggle).toBeChecked();

    await user.keyboard("{Enter}");
    expect(toggle).not.toBeChecked();
  });

  it("ignores the keyboard when disabled", async () => {
    const user = userEvent.setup();
    render(<Toggle label="Locked" checked={false} onChange={() => expect.unreachable()} disabled />);

    await user.tab();

    expect(screen.getByRole("switch", { name: "Locked" })).not.toHaveFocus();
  });
});
