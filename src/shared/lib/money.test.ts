import { describe, expect, it } from "vitest";
import { formatUSD } from "./money";

describe("formatUSD", () => {
  it("keeps four significant digits below a dollar, so a single request does not read as $0.00", () => {
    expect(formatUSD("en", 0.0012345)).toBe("$0.001235");
    expect(formatUSD("en", 0.4)).toBe("$0.40");
  });

  it("shows cents from a dollar up, in the interface language", () => {
    expect(formatUSD("en", 1234.5)).toBe("$1,234.50");
    expect(formatUSD("ru", 4.12).replace(/\s/g, " ")).toBe("4,12 $");
  });
});
