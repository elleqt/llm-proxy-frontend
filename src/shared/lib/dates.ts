/** Day, short month and time; the year only when it is not the current one. */
export function shortDateTime(at: number, now: number, lang: string): string {
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}
