import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/queryClient";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fixtures } from "../../test/server";
import { AccountDrawer } from "./AccountDrawer";

describe("AccountDrawer", () => {
  it("asks before dropping a typed proxy URL, and Keep editing keeps it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const account = fixtures.providerAccount({
      proxy: { mode: "custom", url: "http://proxy.example.com:3128", hasCredentials: true },
    });
    render(
      <QueryClientProvider client={createQueryClient(() => undefined)}>
        <I18nProvider>
          <AccountDrawer account={account} onClose={onClose} removeAction={null} now={Date.parse("2026-09-23T10:00:00Z")} />
        </I18nProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: en["proxy.replace"] }));
    await user.type(screen.getByLabelText(en["proxy.url"]), "http://other.example.com:8080");
    await user.keyboard("{Escape}");

    expect(await screen.findByRole("dialog", { name: en["ui.discardTitle"] })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en["ui.keepEditing"] }));

    expect(screen.queryByRole("dialog", { name: en["ui.discardTitle"] })).toBeNull();
    expect(screen.getByLabelText(en["proxy.url"])).toHaveValue("http://other.example.com:8080");
    expect(onClose).not.toHaveBeenCalled();
  });
});
