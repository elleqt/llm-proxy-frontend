import { Link, Outlet, useMatch } from "react-router";
import { PreferenceSwitches } from "../features/preferences/PreferenceSwitches";
import { useT } from "../shared/i18n";
import styles from "./Layout.module.css";

export function Layout() {
  const t = useT();
  // Admin tables may use the full width; everything else keeps the reading column.
  const wide = useMatch("/admin/*") !== null;
  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          {t("app.name")}
        </Link>
        <PreferenceSwitches />
      </header>
      <main className={wide ? styles.wide : styles.column}>
        <Outlet />
      </main>
    </>
  );
}
