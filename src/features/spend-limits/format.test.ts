import { describe, expect, it } from "vitest";
import { en, type MessageKey } from "../../shared/i18n/en";
import { ru } from "../../shared/i18n/ru";
import { windowText } from "./format";

const tEn = (key: MessageKey) => en[key];
const tRu = (key: MessageKey) => ru[key];

describe("windowText", () => {
  it("agrees the English unit with the count", () => {
    expect(windowText(1440, tEn, "en")).toBe("1 day");
    expect(windowText(2880, tEn, "en")).toBe("2 days");
    expect(windowText(60, tEn, "en")).toBe("1 hour");
    expect(windowText(1, tEn, "en")).toBe("1 minute");
    expect(windowText(90, tEn, "en")).toBe("90 minutes");
  });

  it("agrees the Russian unit with the count", () => {
    expect(windowText(1440, tRu, "ru")).toBe("1 день");
    expect(windowText(2 * 1440, tRu, "ru")).toBe("2 дня");
    expect(windowText(5 * 1440, tRu, "ru")).toBe("5 дней");
    expect(windowText(21 * 60, tRu, "ru")).toBe("21 час");
    expect(windowText(2, tRu, "ru")).toBe("2 минуты");
    expect(windowText(11, tRu, "ru")).toBe("11 минут");
  });
});
