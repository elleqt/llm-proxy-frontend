/**
 * A number as typed: a plain decimal of 0 or more, with a point or a comma
 * (as typed in Russian), else `undefined`. No signs, exponents or hex.
 */
export function parseDecimal(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : undefined;
}
