import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { useDiscardGuard } from "./DiscardChanges";
import { Modal } from "./Modal";
import { TextField } from "./TextField";

function Drawer({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const { requestClose, dialog } = useDiscardGuard(value !== "", onClose);
  return (
    <Modal open onClose={requestClose} title="Edit provider" variant="drawer">
      <TextField label="Value" value={value} onChange={(event) => setValue(event.target.value)} />
      {dialog}
    </Modal>
  );
}

function Harness({ onClose }: { onClose: () => void }) {
  return (
    <I18nProvider>
      <Drawer onClose={onClose} />
    </I18nProvider>
  );
}

describe("useDiscardGuard", () => {
  it("closes a clean drawer at once and asks before dropping edits", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Harness onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(<Harness onClose={onClose} />);
    await user.type(screen.getByLabelText("Value"), "x");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Edit provider" })).toContainElement(document.activeElement as HTMLElement),
    );
    expect(screen.getByLabelText("Value")).toHaveValue("x");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks the same question on a backdrop click when dirty", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.type(screen.getByLabelText("Value"), "x");

    fireEvent.mouseDown(document.querySelector("[data-modal-backdrop]")!);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeVisible();
  });
});
