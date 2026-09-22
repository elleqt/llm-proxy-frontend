import { Navigate, type RouteObject } from "react-router";
import { AdminLayout } from "../pages/admin/AdminLayout";
import { AdminProvidersPage } from "../pages/admin/providers/AdminProvidersPage";
import { AdminSettingsPage } from "../pages/admin/settings/AdminSettingsPage";
import { AdminUserPage } from "../pages/admin/user/AdminUserPage";
import { AdminUsersPage } from "../pages/admin/users/AdminUsersPage";
import { CabinetPage } from "../pages/cabinet/CabinetPage";
import { ConnectPage } from "../pages/connect/ConnectPage";
import { LoginPage } from "../pages/login/LoginPage";
import { NotFoundPage } from "../pages/not-found/NotFoundPage";
import { PasswordPage } from "../pages/password/PasswordPage";
import { AdminGuard, SessionGuard } from "./guards";
import { Layout } from "./Layout";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: "login", element: <LoginPage /> },
      {
        element: <SessionGuard />,
        children: [
          { index: true, element: <CabinetPage /> },
          { path: "password", element: <PasswordPage /> },
          { path: "connect", element: <ConnectPage /> },
          {
            path: "admin",
            element: <AdminGuard />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { index: true, element: <Navigate to="users" replace /> },
                  { path: "users", element: <AdminUsersPage /> },
                  { path: "users/:userId", element: <AdminUserPage /> },
                  { path: "providers", element: <AdminProvidersPage /> },
                  { path: "settings", element: <AdminSettingsPage /> },
                  { path: "*", element: <NotFoundPage /> },
                ],
              },
            ],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
