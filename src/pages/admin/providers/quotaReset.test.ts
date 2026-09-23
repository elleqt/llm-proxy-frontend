import { describe, expect, it } from "vitest";
import { en } from "../../../shared/i18n/en";
import { ru } from "../../../shared/i18n/ru";
import { quotaReset } from "./quotaReset";

const NOW = Date.parse("2026-09-23T10:00:00Z");
const inEn = (resetAt: string) => quotaReset(resetAt, NOW, "en", (key) => en[key]);
const inRu = (resetAt: string) => quotaReset(resetAt, NOW, "ru", (key) => ru[key]);

describe("quota reset", () => {
  it("counts down in hours and minutes within a day", () => {
    expect(inEn("2026-09-23T14:12:00Z")).toBe("resets in 4 h 12 min");
    expect(inRu("2026-09-23T14:12:00Z")).toBe("сброс через 4 ч 12 мин");
    expect(inEn("2026-09-23T13:00:00Z")).toBe("resets in 3 h");
    // Rounded up: a few seconds left is not "in 0 min".
    expect(inEn("2026-09-23T10:00:20Z")).toBe("resets in 1 min");
  });

  it("gives a date without the year when it is this year's", () => {
    expect(inRu("2026-09-28T10:00:00Z")).toMatch(/^сброс 28 сент\., \d\d:\d\d$/);
    expect(inEn("2026-09-28T10:00:00Z")).not.toMatch(/2026/);
  });

  it("gives the year when it is another year's", () => {
    expect(inEn("2027-03-01T10:00:00Z")).toMatch(/2027/);
    expect(inRu("2027-03-01T10:00:00Z")).toMatch(/^сброс 1 мар\. 2027/);
  });

  it("says a reset that has passed happened", () => {
    expect(inEn("2026-09-23T09:59:00Z")).toBe("reset");
    expect(inRu("2026-09-23T10:00:00Z")).toBe("сброшено");
  });
});
