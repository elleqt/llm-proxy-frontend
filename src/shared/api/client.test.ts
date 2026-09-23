import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { errorResponse, http, server } from "../../test/server";
import {
  ApiError,
  client,
  NETWORK_ERROR,
  PasswordChangeRequiredError,
  UNKNOWN_ERROR,
  UnauthenticatedError,
  unwrap,
} from "./client";

const userId = "00000000-0000-4000-8000-000000000002";

async function failure(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("unwrap", () => {
  it("raises 401 as UnauthenticatedError", async () => {
    server.use(
      http.post("/api/auth/login", ({ response }) =>
        response(401).json({ code: "invalid_credentials", message: "invalid credentials" }),
      ),
    );

    const error = await failure(
      unwrap(client.POST("/api/auth/login", { body: { email: "ada@example.com", password: "x" } })),
    );
    expect(error).toBeInstanceOf(UnauthenticatedError);
    expect(error).toMatchObject({ status: 401, code: "invalid_credentials", field: undefined });
  });

  it("raises 403 password_change_required as PasswordChangeRequiredError", async () => {
    server.use(
      http.get("/api/me/tokens", ({ response }) =>
        response.untyped(
          errorResponse(403, { code: "password_change_required", message: "change your password" }),
        ),
      ),
    );

    const error = await failure(unwrap(client.GET("/api/me/tokens")));
    expect(error).toBeInstanceOf(PasswordChangeRequiredError);
    expect(error).toMatchObject({ status: 403, code: "password_change_required" });
  });

  it("raises any other 403 as a plain ApiError the screen shows in place", async () => {
    server.use(
      http.get("/api/admin/users", ({ response }) =>
        response.untyped(errorResponse(403, { code: "forbidden", message: "admins only" })),
      ),
    );

    const error = await failure(unwrap(client.GET("/api/admin/users")));
    expect(error).not.toBeInstanceOf(PasswordChangeRequiredError);
    expect(error).not.toBeInstanceOf(UnauthenticatedError);
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("keeps the field of a 422", async () => {
    server.use(
      http.patch("/api/admin/users/{userId}", ({ response }) =>
        response(422).json({ code: "invalid_rule", message: "bad rule", field: "policy[1]" }),
      ),
    );

    const error = await failure(
      unwrap(
        client.PATCH("/api/admin/users/{userId}", {
          params: { path: { userId } },
          body: { policy: ["chatgpt:*", "nope"] },
        }),
      ),
    );
    expect(error.constructor).toBe(ApiError);
    expect(error).toMatchObject({ status: 422, code: "invalid_rule", field: "policy[1]" });
  });

  it("raises a network failure as status 0 network_error", async () => {
    server.use(http.get("/api/me", () => HttpResponse.error()));

    const error = await failure(unwrap(client.GET("/api/me")));
    expect(error.constructor).toBe(ApiError);
    expect(error).toMatchObject({ status: 0, code: NETWORK_ERROR });
  });

  it("gives an error without an Error body the unknown code", async () => {
    server.use(
      http.get("/api/me", ({ response }) =>
        response.untyped(new HttpResponse("<html>Bad Gateway</html>", { status: 502 })),
      ),
    );

    const error = await failure(unwrap(client.GET("/api/me")));
    expect(error).toMatchObject({ status: 502, code: UNKNOWN_ERROR });
  });

  it("marks a body-less POST as JSON, as the API requires", async () => {
    let contentType: string | null = null;
    server.use(
      http.post("/api/auth/logout", ({ request }) => {
        contentType = request.headers.get("Content-Type");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await unwrap(client.POST("/api/auth/logout"));

    expect(contentType).toBe("application/json");
  });
});
