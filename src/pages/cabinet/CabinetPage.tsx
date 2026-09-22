import { useT } from "../../shared/i18n";

export function CabinetPage() {
  const t = useT();
  return <h1>{t("page.cabinet.title")}</h1>;
}
