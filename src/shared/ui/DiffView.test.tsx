import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { DiffView } from "./DiffView";

const DIFF = "@@ -1 +1 @@\n-request-retry: 3\n+request-retry: 5\n";

describe("DiffView", () => {
  it("shows the diff and copies it verbatim, not its markup", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <I18nProvider>
        <DiffView text={DIFF} />
      </I18nProvider>,
    );

    expect(container.querySelector("pre")?.textContent).toBe(DIFF);
    await user.click(screen.getByRole("button", { name: en["ui.copy"] }));

    await expect(navigator.clipboard.readText()).resolves.toBe(DIFF);
  });
});
