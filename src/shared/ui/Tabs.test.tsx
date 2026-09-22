import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

const items = [
  { id: "profile", label: "Profile", content: "Profile panel" },
  { id: "keys", label: "Keys", content: "Keys panel" },
  { id: "usage", label: "Usage", content: "Usage panel" },
];

function setup() {
  const user = userEvent.setup();
  render(
    <>
      <Tabs label="User" items={items} />
      <button type="button">After</button>
    </>,
  );
  const tab = (name: string) => screen.getByRole("tab", { name });
  return { user, tab };
}

describe("Tabs", () => {
  it("is one Tab stop: into the selected tab, then on to its panel", async () => {
    const { user, tab } = setup();

    await user.tab();
    expect(tab("Profile")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("tabpanel", { name: "Profile" })).toHaveFocus();
  });

  it("moves focus and selection with the arrow keys, wrapping at the ends", async () => {
    const { user, tab } = setup();
    await user.tab();

    await user.keyboard("{ArrowRight}");
    expect(tab("Keys")).toHaveFocus();
    expect(tab("Keys")).toHaveAttribute("aria-selected", "true");
    expect(tab("Profile")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "Keys" })).toHaveTextContent("Keys panel");

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(tab("Profile")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(tab("Usage")).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Usage" })).toHaveTextContent("Usage panel");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const { user, tab } = setup();
    await user.tab();

    await user.keyboard("{End}");
    expect(tab("Usage")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tab("Profile")).toHaveFocus();
    expect(tab("Profile")).toHaveAttribute("aria-selected", "true");
  });
});
