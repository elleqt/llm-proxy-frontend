import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { TextField } from "./TextField";

function Harness({
  children = <TextField label="Reason" />,
  closeOnBackdrop,
}: {
  children?: ReactNode;
  closeOnBackdrop?: boolean | undefined;
}) {
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
        {...(closeOnBackdrop === undefined ? {} : { closeOnBackdrop })}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger">Revoke key</Button>
          </>
        }
      >
        {children}
      </Modal>
      <button type="button">After</button>
    </I18nProvider>
  );
}

async function openModal(children?: ReactNode, closeOnBackdrop?: boolean) {
  const user = userEvent.setup();
  render(<Harness closeOnBackdrop={closeOnBackdrop}>{children}</Harness>);
  await user.click(screen.getByRole("button", { name: "Revoke" }));
  return user;
}

describe("Modal backdrop", () => {
  it("closes the dialog on a click by default", async () => {
    await openModal();

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is ignored with closeOnBackdrop={false}, while Escape still closes", async () => {
    const user = await openModal(undefined, false);

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/** Content whose only control is replaced by its result, as a busy action is. */
function Replacing() {
  const [done, setDone] = useState(false);
  return done ? <p>Issued</p> : <button onClick={() => setDone(true)}>Issue</button>;
}

describe("Modal", () => {
  it("is a dialog named by its title, takes focus, and shuts off the page behind it", async () => {
    const user = await openModal();

    const dialog = screen.getByRole("dialog", { name: "Revoke key “laptop”?" });
    expect(dialog).toHaveFocus();
    expect(screen.getByText("Before").closest("[inert]")).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(screen.getByText("Before").closest("[inert]")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
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

  it("closes on Escape even when focus has fallen to the page body", async () => {
    await openModal();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toHaveFocus();
  });

  it("pulls focus back in when the focused control disappears", async () => {
    const user = await openModal(<Replacing />);

    await user.click(screen.getByRole("button", { name: "Issue" }));

    expect(screen.getByText("Issued")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
  });

  it("gives focus back to the opener when closed from inside", async () => {
    const user = await openModal();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toHaveFocus();
  });

  it("leaves focus on an autoFocus field and still returns it to the opener", async () => {
    const user = await openModal(<TextField label="Name" autoFocus />);

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Revoke" })).toHaveFocus();
  });

  it("starts on initialFocus", async () => {
    function Confirm() {
      const [open, setOpen] = useState(true);
      const cancel = useRef<HTMLButtonElement>(null);
      return (
        <I18nProvider>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Block Alice?"
            initialFocus={cancel}
            footer={
              <>
                <Button ref={cancel}>Cancel</Button>
                <Button variant="danger">Block Alice</Button>
              </>
            }
          >
            Alice can no longer sign in.
          </Modal>
        </I18nProvider>
      );
    }
    render(<Confirm />);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("sends focus to returnFocus when the opener is gone", async () => {
    function Rows() {
      const [rows, setRows] = useState(["laptop", "ci"]);
      const [revoking, setRevoking] = useState<string | null>(null);
      const table = useRef<HTMLHeadingElement>(null);
      return (
        <I18nProvider>
          <h2 ref={table} tabIndex={-1}>
            Keys
          </h2>
          {rows.map((row) => (
            <button key={row} type="button" onClick={() => setRevoking(row)}>
              Revoke {row}
            </button>
          ))}
          <Modal open={revoking !== null} onClose={() => setRevoking(null)} title="Revoke?" returnFocus={table}>
            <Button
              variant="danger"
              onClick={() => {
                setRows((current) => current.filter((row) => row !== revoking));
                setRevoking(null);
              }}
            >
              Revoke key
            </Button>
          </Modal>
        </I18nProvider>
      );
    }
    const user = userEvent.setup();
    render(<Rows />);

    await user.click(screen.getByRole("button", { name: "Revoke laptop" }));
    await user.click(screen.getByRole("button", { name: "Revoke key" }));

    expect(screen.queryByRole("button", { name: "Revoke laptop" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keys" })).toHaveFocus();
  });
});
