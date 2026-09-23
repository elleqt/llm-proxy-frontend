import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Settings = components["schemas"]["Settings"];
export type SettingsUpdateRequest = components["schemas"]["SettingsUpdateRequest"];
export type ModelPrice = components["schemas"]["ModelPrice"];
export type PriceList = components["schemas"]["PriceList"];
export type PriceEntry = components["schemas"]["PriceEntry"];
export type PriceCatalog = components["schemas"]["PriceCatalog"];

export const settingsQuery = queryOptions({
  queryKey: ["admin", "settings"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/settings", { signal })),
});

/** The prices in force (catalog with the administrator's overrides on top) and the catalog's state. */
export const pricesQuery = queryOptions({
  queryKey: ["admin", "prices"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/prices", { signal })),
});
