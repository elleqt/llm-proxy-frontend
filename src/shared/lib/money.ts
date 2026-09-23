/**
 * US dollars in the interface language. From $1 up: cents. Below: up to four
 * significant digits, so an estimate of a single request ($0.0012) does not
 * round to $0.00.
 */
export function formatUSD(lang: string, amount: number): string {
  const small = amount !== 0 && Math.abs(amount) < 1;
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    ...(small ? { minimumSignificantDigits: 2, maximumSignificantDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }).format(amount);
}
