import { useT } from "../../../shared/i18n";

export function AdminUsersPage() {
  const t = useT();
  return <h1>{t("page.admin.users.title")}</h1>;
}
