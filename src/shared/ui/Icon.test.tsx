import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton, LockIcon, TrashIcon } from "./Icon";

describe("Icon", () => {
  it("is an image only when labelled", () => {
    render(
      <>
        <LockIcon label="With credentials" />
        <TrashIcon />
      </>,
    );

    expect(screen.getByRole("img", { name: "With credentials" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});

describe("IconButton", () => {
  it("is named by its label and does not submit a form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <IconButton label="Delete provider" tone="danger">
          <TrashIcon />
        </IconButton>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Delete provider" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
