import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../shared/i18n/en";
import { renderWithClient } from "../../test/render";
import { fixtures, http, server } from "../../test/server";
import { AccountDrawer } from "./AccountDrawer";

/** The drawer of an account behind a stored own proxy with credentials. */
function drawer() {
  const onClose = vi.fn();
  const account = fixtures.providerAccount({
    proxy: { mode: "custom", url: "http://proxy.example.com:3128", hasCredentials: true },
  });
  renderWithClient(<AccountDrawer account={account} onClose={onClose} removeAction={null} now={Date.parse("2026-09-23T10:00:00Z")} />);
  return { onClose, account, user: userEvent.setup() };
}

const save = () => screen.getByRole("button", { name: en["providers.save"] });
const replace = () => screen.getByRole("button", { name: en["proxy.replace"] });

describe("AccountDrawer", () => {
  it("is named by the provider and the account", () => {
    drawer();
    expect(screen.getByRole("dialog", { name: "claude · ops" })).toBeInTheDocument();
  });

  it("shows a stored own proxy as its line, with nothing to save", () => {
    drawer();
    expect(screen.getByText("HTTP")).toBeInTheDocument();
    expect(screen.getByText("proxy.example.com:3128")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: en["proxy.withCredentials"] })).toBeInTheDocument();
    expect(screen.queryByLabelText(en["proxy.url"])).toBeNull();
    expect(save()).toBeDisabled();
  });

  it("asks before dropping a typed proxy URL, and Keep editing keeps it", async () => {
    const { user, onClose } = drawer();

    await user.click(replace());
    await user.type(screen.getByLabelText(en["proxy.url"]), "http://other.example.com:8080");
    await user.keyboard("{Escape}");

    expect(await screen.findByRole("dialog", { name: en["ui.discardTitle"] })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en["ui.keepEditing"] }));

    expect(screen.queryByRole("dialog", { name: en["ui.discardTitle"] })).toBeNull();
    expect(screen.getByLabelText(en["proxy.url"])).toHaveValue("http://other.example.com:8080");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("brings the stored line back on Cancel, clean: Escape closes without asking", async () => {
    const { user, onClose } = drawer();

    await user.click(replace());
    await user.type(screen.getByLabelText(en["proxy.url"]), "http://other.example.com:8080");
    await user.click(screen.getByRole("button", { name: en["proxy.cancelReplace"] }));

    expect(screen.queryByLabelText(en["proxy.url"])).toBeNull();
    expect(replace()).toHaveFocus();
    expect(save()).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: en["ui.discardTitle"] })).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("saves a replacing URL as the account's own proxy", async () => {
    const sent: unknown[] = [];
    server.use(
      http.patch("/api/admin/providers/{accountId}", async ({ request, response }) => {
        sent.push(await request.json());
        return response(200).json(fixtures.providerAccount());
      }),
    );
    const { user, onClose } = drawer();

    await user.click(replace());
    await user.type(screen.getByLabelText(en["proxy.url"]), "http://user:pw@other.example.com:8080");
    await user.click(save());

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent).toEqual([{ proxy: { mode: "custom", url: "http://user:pw@other.example.com:8080" } }]);
  });
});
