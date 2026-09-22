import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider, type DataRouter } from "react-router";
import { I18nProvider } from "../shared/i18n";

export function App({ router, queryClient }: { router: DataRouter; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
