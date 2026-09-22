import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("describes the input by its hint and, once there is one, its error", () => {
    const { rerender } = render(<TextField label="New password" hint="At least 12 characters." />);
    const input = screen.getByRole("textbox", { name: "New password" });

    expect(input).toHaveAccessibleDescription("At least 12 characters.");
    expect(input).toBeValid();

    rerender(<TextField label="New password" hint="At least 12 characters." error="The password is too weak." />);

    expect(input).toHaveAccessibleDescription("At least 12 characters. The password is too weak.");
    expect(input).toBeInvalid();
  });
});
