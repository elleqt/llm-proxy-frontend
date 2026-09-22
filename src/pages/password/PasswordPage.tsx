import { useT } from "../../shared/i18n";

export function PasswordPage() {
  const t = useT();
  return <h1>{t("page.password.title")}</h1>;
}
