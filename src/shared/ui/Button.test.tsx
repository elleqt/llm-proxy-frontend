import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

function renderForm(busy: boolean) {
  const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
  const click = vi.fn();
  render(
    <form onSubmit={(event) => submit(event.nativeEvent as SubmitEvent)}>
      <label>
        Label <input />
      </label>
      <Button type="submit" variant="primary" busy={busy} onClick={click}>
        Issue
      </Button>
    </form>,
  );
  return { submit, click };
}

describe("Button", () => {
  it("submits its form when idle", async () => {
    const user = userEvent.setup();
    const { submit, click } = renderForm(false);

    await user.click(screen.getByRole("button", { name: "Issue" }));

    expect(click).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
  });

  it("while busy ignores clicks and Enter in the form, and keeps focus", async () => {
    const user = userEvent.setup();
    const { submit, click } = renderForm(true);
    const button = screen.getByRole("button", { name: "Issue" });

    await user.click(button);
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Label" }), "laptop{Enter}");

    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
