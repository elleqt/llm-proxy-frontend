import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type ProviderAccount = components["schemas"]["ProviderAccount"];
export type LoginProvider = components["schemas"]["ProviderLoginStartRequest"]["provider"];

/** Providers a vendor account can be added for, as the contract enumerates them. */
export const LOGIN_PROVIDERS = ["claude", "chatgpt"] as const satisfies readonly LoginProvider[];

export const providerAccountsQuery = queryOptions({
  queryKey: ["admin", "providers"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/providers", { signal })),
});

/** How the account is called on screen and in confirmations: label, else email, else id. */
export function accountName(account: Pick<ProviderAccount, "id" | "label" | "email">): string {
  return account.label || account.email || account.id;
}
