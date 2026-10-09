import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { en } from "../../shared/i18n/en";
import { fixtures } from "../../test/server";
import type { ProviderAccount } from "./providers";
import { StatusDot } from "./StatusDot";

function dot(account: ProviderAccount) {
  const { container } = render(
    <I18nProvider>
      <StatusDot account={account} now={Date.parse("2026-09-23T10:00:00Z")} />
    </I18nProvider>,
  );
  return container.querySelector("[data-status]");
}

describe("StatusDot", () => {
  it("is decorative, and its title gives a subscription's state and token refresh", () => {
    const shown = dot(fixtures.providerAccount({ status: "error", lastRefreshedAt: null }));

    expect(shown).toHaveAttribute("aria-hidden", "true");
    expect(shown).toHaveAttribute("data-status", "error");
    expect(shown).toHaveAttribute(
      "title",
      `${en["providers.status.error"]} · ${en["providers.refreshed"]}: ${en["providers.never"]}`,
    );
  });

  it("marks a disabled account as such, and an OpenAI-compatible one has no token to name", () => {
    const shown = dot(
      fixtures.providerAccount({
        disabled: true,
        compat: { name: "acme", baseURL: "https://api.example.com/v1", hasApiKey: false, models: [] },
      }),
    );

    expect(shown).toHaveAttribute("data-status", "disabled");
    expect(shown).toHaveAttribute("title", en["providers.disabled"]);
  });
});
