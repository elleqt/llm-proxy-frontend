import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type AdminUser = components["schemas"]["AdminUser"];
export type Activity = components["schemas"]["Activity"];

/** Every account, humans and service accounts. */
export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/users", { signal })),
});

export const adminUserQuery = (userId: string) =>
  queryOptions({
    queryKey: ["admin", "users", userId],
    queryFn: ({ signal }) => unwrap(client.GET("/api/admin/users/{userId}", { params: { path: { userId } }, signal })),
  });

export const adminUserTokensQuery = (userId: string) =>
  queryOptions({
    queryKey: ["admin", "users", userId, "tokens"],
    queryFn: ({ signal }) =>
      unwrap(client.GET("/api/admin/users/{userId}/tokens", { params: { path: { userId } }, signal })),
  });

export const adminUserActivityQuery = (userId: string) =>
  queryOptions({
    queryKey: ["admin", "users", userId, "activity"],
    queryFn: ({ signal }) =>
      unwrap(client.GET("/api/admin/users/{userId}/activity", { params: { path: { userId } }, signal })),
  });
