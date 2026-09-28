import type { MessageKey } from "../../shared/i18n";

export type WindowUnit = "minutes" | "hours" | "days";
export const UNIT_MINUTES: Record<WindowUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** The largest unit a window is a whole number of. */
export function windowParts(minutes: number): { count: number; unit: WindowUnit } {
  if (minutes % 1440 === 0) return { count: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { count: minutes / 60, unit: "hours" };
  return { count: minutes, unit: "minutes" };
}

export function windowText(minutes: number, t: (key: MessageKey) => string): string {
  const { count, unit } = windowParts(minutes);
  return `${count} ${t(`limits.unit.${unit}`)}`;
}

export function money(usd: number, lang: string): string {
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}
