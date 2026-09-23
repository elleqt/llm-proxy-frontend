import { Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../entities/user/me";
import { NotFoundPage } from "../pages/not-found/NotFoundPage";
import { UnauthenticatedError } from "../shared/api/client";
import { useErrorMessage, useT } from "../shared/i18n";

/**
 * Auth boundary, driven by `GET /api/me`: no session → /login; a restricted
 * session (temporary password) reaches only /password.
 */
export function SessionGuard() {
  const me = useMe();
  const { pathname } = useLocation();
  const t = useT();
  const errorMessage = useErrorMessage();

  if (me.error instanceof UnauthenticatedError) return <Navigate to="/login" replace />;
  if (me.data === undefined) {
    return me.isError ? <p role="alert">{errorMessage(me.error)}</p> : <p>{t("app.loading")}</p>;
  }
  if (me.data.restricted && pathname !== "/password") return <Navigate to="/password" replace />;
  return <Outlet />;
}

/** `/admin/*` exists only for administrators; anyone else sees not-found. */
export function AdminGuard() {
  const { data } = useMe();
  return data?.role === "admin" ? <Outlet /> : <NotFoundPage />;
}
