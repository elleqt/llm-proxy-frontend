import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type SpendLimit = components["schemas"]["SpendLimit"];
export type SpendWindow = components["schemas"]["SpendWindow"];
export type SpendLimits = components["schemas"]["SpendLimits"];
/** A window as its user sees it: the dollar amounts only while costs are visible. */
export type MySpendWindow = components["schemas"]["MySpendWindow"];

export const myLimitsQuery = queryOptions({
  queryKey: ["myLimits"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/me/limits", { signal })),
});

export const defaultLimitsQuery = queryOptions({
  queryKey: ["defaultLimits"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/limits", { signal })),
});

/** Every account's limits query starts with this key: invalidate it when the defaults change. */
export const userLimitsKey = ["userLimits"] as const;

export const userLimitsQuery = (userId: string) =>
  queryOptions({
    queryKey: [...userLimitsKey, userId],
    queryFn: ({ signal }) =>
      unwrap(client.GET("/api/admin/users/{userId}/limits", { params: { path: { userId } }, signal })),
  });
