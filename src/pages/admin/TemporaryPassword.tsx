import type { components } from "../../shared/api/schema";
import { useLang, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { CopyField } from "../../shared/ui";

/** A temporary password, shown once, with when it stops working. */
export function TemporaryPassword({ value }: { value: components["schemas"]["TemporaryPassword"] }) {
  const t = useT();
  const [lang] = useLang();
  const expires = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value.expiresAt),
  );
  return (
    <>
      <CopyField label={t("admin.tempPassword")} value={value.password} />
      <p>{fill(t("admin.tempPasswordExpires"), { time: expires })}</p>
    </>
  );
}
