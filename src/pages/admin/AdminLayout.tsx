import { NavLink, Outlet } from "react-router";
import { useT } from "../../shared/i18n";
import styles from "./admin.module.css";

/** The admin section: its own navigation line above each admin screen. */
export function AdminLayout() {
  const t = useT();
  const link = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;
  return (
    <>
      <nav aria-label={t("admin.nav")} className={styles.nav}>
        <NavLink to="/admin/users" className={link}>
          {t("page.admin.users.title")}
        </NavLink>
        <NavLink to="/admin/providers" className={link}>
          {t("page.admin.providers.title")}
        </NavLink>
        <NavLink to="/admin/settings" className={link}>
          {t("page.admin.settings.title")}
        </NavLink>
      </nav>
      <Outlet />
    </>
  );
}
