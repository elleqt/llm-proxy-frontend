import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useMatch } from "react-router";
import { meQuery } from "../entities/user/me";
import { PreferenceSwitches } from "../features/preferences/PreferenceSwitches";
import { SignOutButton } from "../features/session/SignOutButton";
import { useT } from "../shared/i18n";
import styles from "./Layout.module.css";

export function Layout() {
  const t = useT();
  // Admin tables get a wider column than the reading column everything else
  // keeps, but still a bounded, centred one, so the admin reads like the rest
  // of the site on a large screen. The header stays in the column, the switches
  // at its right as on the instruction page.
  const wide = useMatch("/admin/*") !== null;
  return (
    <div className={wide ? `${styles.column} ${styles.wide}` : styles.column}>
      <header className={styles.header}>
        <div className={styles.site}>
          <Link to="/" className={styles.brand}>
            {t("app.name")}
          </Link>
          <SessionNav />
        </div>
        <PreferenceSwitches />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

/** Navigation and sign-out, for a signed-in user only. */
function SessionNav() {
  const t = useT();
  // Reads the session from the cache without asking for it: /login must not
  // call /api/me, and after sign-out the cleared cache hides this at once.
  const { data: me } = useQuery({ ...meQuery, enabled: false });
  if (me === undefined) return null;
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.link} ${styles.active}` : styles.link);
  return (
    <nav aria-label={t("nav.label")} className={styles.nav}>
      {/* A restricted session reaches only /password: links elsewhere would bounce back. */}
      {!me.restricted && (
        <>
          <NavLink to="/" end className={link}>
            {t("nav.cabinet")}
          </NavLink>
          <NavLink to="/connect" className={link}>
            {t("nav.connect")}
          </NavLink>
          {me.role === "admin" && (
            <NavLink to="/admin" className={link}>
              {t("nav.admin")}
            </NavLink>
          )}
        </>
      )}
      <SignOutButton className={styles.signOut} />
    </nav>
  );
}
