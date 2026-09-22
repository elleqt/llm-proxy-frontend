import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { TextField } from "./TextField";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <I18nProvider>
      <button type="button">Before</button>
      <button type="button" onClick={() => setOpen(true)}>
        Revoke
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Revoke key “laptop”?"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Revoke key</Button>
          </>
        }
      >
        <TextField label="Reason" />
      </Modal>
      <button type="button">After</button>
    </I18nProvider>
  );
}

async function openModal() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Revoke" }));
  return user;
}

describe("Modal", () => {
  it("is a dialog named by its title and takes focus on open", async () => {
    await openModal();

    const dialog = screen.getByRole("dialog", { name: "Revoke key “laptop”?" });
    expect(dialog).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    const user = await openModal();
    const close = screen.getByRole("button", { name: en["ui.close"] });
    const confirm = screen.getByRole("button", { name: "Revoke key" });

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the opener", async () => {
    const user = await openModal();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toHaveFocus();
  });

  it("gives focus back to the opener when closed from inside", async () => {
    const user = await openModal();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toHaveFocus();
  });
});
