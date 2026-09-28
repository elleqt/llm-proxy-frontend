import type { MessageKey } from "../../shared/i18n";

export type WindowUnit = "minutes" | "hours" | "days";
export const UNIT_MINUTES: Record<WindowUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** The largest unit a window is a whole number of. */
export function windowParts(minutes: number): { count: number; unit: WindowUnit } {
  if (minutes % 1440 === 0) return { count: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { count: minutes / 60, unit: "hours" };
  return { count: minutes, unit: "minutes" };
}

/** The plural categories the dictionaries define (English and Russian use no others). */
type UnitForm = "one" | "few" | "many" | "other";

/** The unit word in the form `count` takes in `lang`: "1 day", "2 days"; "1 день", "2 дня", "5 дней". */
export function unitLabel(unit: WindowUnit, count: number, t: (key: MessageKey) => string, lang: string): string {
  const category = new Intl.PluralRules(lang).select(count);
  const form: UnitForm = category === "zero" || category === "two" ? "other" : category;
  return t(`limits.unit.${unit}.${form}`);
}

export function windowText(minutes: number, t: (key: MessageKey) => string, lang: string): string {
  const { count, unit } = windowParts(minutes);
  return `${count} ${unitLabel(unit, count, t, lang)}`;
}

export function money(usd: number, lang: string): string {
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}
