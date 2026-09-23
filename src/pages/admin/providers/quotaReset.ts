import type { MessageKey } from "../../../shared/i18n";
import { shortDateTime } from "../../../shared/lib/dates";
import { fill } from "../../../shared/lib/template";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * When a quota window resets, as short as the table allows: "reset" once it
 * has passed, "resets in 4 h 12 min" within a day, else the date without the
 * year when it is this year's.
 */
export function quotaReset(resetAt: string, now: number, lang: string, t: (key: MessageKey) => string): string {
  const at = Date.parse(resetAt);
  const left = at - now;
  if (left <= 0) return t("providers.resetDone");
  if (left < DAY) {
    // Rounded up: "in 0 min" would read as already reset.
    const minutes = Math.ceil(left / MINUTE);
    const hours = Math.floor(minutes / 60);
    const parts = [
      hours > 0 ? fill(t("providers.hours"), { n: hours }) : "",
      minutes % 60 > 0 ? fill(t("providers.minutes"), { n: minutes % 60 }) : "",
    ];
    return fill(t("providers.resetsIn"), { duration: parts.filter(Boolean).join(" ") });
  }
  const date = shortDateTime(at, now, lang);
  return fill(t("providers.resets"), { time: date });
}
