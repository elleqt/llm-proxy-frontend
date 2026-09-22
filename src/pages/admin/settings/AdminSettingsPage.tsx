import { useT } from "../../../shared/i18n";

export function AdminSettingsPage() {
  const t = useT();
  return <h1>{t("page.admin.settings.title")}</h1>;
}
