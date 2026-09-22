/**
 * Fills the `{name}` placeholders of a translated string. A placeholder with
 * no value is left as it is, so a missing value shows up rather than vanishing.
 *
 *     fill(t("revoke.title"), { label: token.label })
 */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
