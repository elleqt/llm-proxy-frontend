import { Outlet, useMatch } from "react-router";
import { PreferenceSwitches } from "../features/preferences/PreferenceSwitches";
import styles from "./Layout.module.css";

export function Layout() {
  // Admin tables may use the full width; everything else keeps the reading
  // column, with the switches at its top right as on the instruction page.
  const wide = useMatch("/admin/*") !== null;
  return (
    <div className={wide ? undefined : styles.column}>
      <PreferenceSwitches />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
