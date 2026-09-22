import { describe, expect, it } from "vitest";
import { ApiError, NETWORK_ERROR } from "../api/client";
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
    expect(errorMessage(en, new ApiError(0, NETWORK_ERROR))).toBe(en["error.network_error"]);
  });

  it("never shows an unknown code; a refusal reads as one", () => {
    expect(errorMessage(en, new ApiError(409, "brand_new_code"))).toBe(en["error.unknown"]);
    expect(errorMessage(en, new ApiError(403, "brand_new_code"))).toBe(en["error.forbidden"]);
  });

  it("gives a generic message for anything that is not an ApiError", () => {
    expect(errorMessage(en, new TypeError("boom"))).toBe(en["error.unknown"]);
  });
});
