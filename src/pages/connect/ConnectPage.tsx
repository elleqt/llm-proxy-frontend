import { useT } from "../../shared/i18n";

export function ConnectPage() {
  const t = useT();
  return <h1>{t("page.connect.title")}</h1>;
}
