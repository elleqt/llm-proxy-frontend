import { useT } from "../../shared/i18n";

export function LoginPage() {
  const t = useT();
  return <h1>{t("page.login.title")}</h1>;
}
