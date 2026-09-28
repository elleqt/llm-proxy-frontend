import { useQuery } from "@tanstack/react-query";
import { myLimitsQuery } from "../../entities/limits/limits";
import { SpendWindows } from "../../features/spend-limits/SpendWindows";
import { useT } from "../../shared/i18n";
import { Card } from "../../shared/ui";

/**
 * The user's own spend limits and how much of each window is left. Absent
 * without limits, and while they are unknown: nothing here is a failure the
 * user can act on.
 */
export function SpendLimitsSection() {
  const t = useT();
  const limits = useQuery(myLimitsQuery);
  if (!limits.isSuccess || limits.data.windows.length === 0) return null;
  return (
    <Card title={t("limits.title")}>
      <SpendWindows windows={limits.data.windows} />
    </Card>
  );
}
