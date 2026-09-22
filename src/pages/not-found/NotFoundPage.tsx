import { Link } from "react-router";
import { useT } from "../../shared/i18n";

export function NotFoundPage() {
  const t = useT();
  return (
    <>
      <h1>{t("page.notFound.title")}</h1>
      <p>{t("page.notFound.body")}</p>
      <p>
        <Link to="/">{t("page.notFound.home")}</Link>
      </p>
    </>
  );
}
