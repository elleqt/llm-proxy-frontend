import { useT } from "../../../shared/i18n";

export function AdminProvidersPage() {
  const t = useT();
  return <h1>{t("page.admin.providers.title")}</h1>;
}
