import { useT } from "../../../shared/i18n";

export function AdminUserPage() {
  const t = useT();
  return <h1>{t("page.admin.user.title")}</h1>;
}
