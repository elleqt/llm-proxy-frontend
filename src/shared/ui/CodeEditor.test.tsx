import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CodeEditor } from "./CodeEditor";

function Editor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="config">Config</label>
      <CodeEditor id="config" value={value} describedBy="config-hint" onChange={setValue} />
      <p id="config-hint">Edit with care.</p>
    </>
  );
}

describe("CodeEditor", () => {
  it("edits plain YAML through its label while showing it numbered and colored", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor initial={"request-retry: 3\nmax-retry-interval: 30"} />);

    const box = screen.getByRole("textbox", { name: "Config" });
    expect(box).toHaveAccessibleDescription("Edit with care.");
    await user.type(box, "{Enter}proxy-url: x");

    expect(box).toHaveValue("request-retry: 3\nmax-retry-interval: 30\nproxy-url: x");
    const shown = container.querySelector("pre[aria-hidden='true']");
    expect([...(shown?.children ?? [])].map((line) => line.firstElementChild?.textContent)).toEqual(["1", "2", "3"]);
    expect(shown).toHaveTextContent("proxy-url: x");
    await waitFor(() => expect(shown?.querySelector(".token.key")).toHaveTextContent("request-retry"));
  });
});
