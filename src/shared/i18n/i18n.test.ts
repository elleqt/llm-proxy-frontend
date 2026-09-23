import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { en } from "./en";
import { errorMessage } from "./i18n";
import { ru } from "./ru";

describe("dictionaries", () => {
  it("en and ru have the same keys", () => {
    const enKeys = Object.keys(en);
    const ruKeys = Object.keys(ru);
    expect(enKeys.filter((key) => !ruKeys.includes(key))).toEqual([]);
    expect(ruKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });
});

describe("errorMessage", () => {
  it("translates a known code", () => {
    expect(errorMessage(ru, new ApiError(401, "invalid_credentials"))).toBe(ru["error.invalid_credentials"]);
  });

  it("never shows an unknown code; a refusal reads as one", () => {
    expect(errorMessage(en, new ApiError(409, "brand_new_code"))).toBe(en["error.unknown"]);
    expect(errorMessage(en, new ApiError(403, "brand_new_code"))).toBe(en["error.forbidden"]);
  });

  it("gives a generic message for anything that is not an ApiError", () => {
    expect(errorMessage(en, new TypeError("boom"))).toBe(en["error.unknown"]);
  });

  it("prefers the password screen's own wording for invalid_credentials there", () => {
    const refused = new ApiError(401, "invalid_credentials");
    expect(errorMessage(en, refused, "password")).toBe(en["errorIn.password.invalid_credentials"]);
    expect(errorMessage(en, refused)).toBe(en["error.invalid_credentials"]);
  });

  it("falls back to the general text for a code the context does not override", () => {
    expect(errorMessage(ru, new ApiError(400, "weak_password"), "password")).toBe(ru["error.weak_password"]);
  });
});
