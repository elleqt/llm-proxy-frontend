import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../entities/user/me";
import { myModelsQuery } from "../../entities/user/myModels";
import { useT } from "../../shared/i18n";
import styles from "./NoModelAccessNotice.module.css";

/**
 * Says so when the user may use no model at all: their policy is empty, or its
 * rules match nothing in today's catalogue. Every request with their keys
 * would be refused. Issuing keys stays possible; they start working once
 * access is granted.
 */
export function NoModelAccessNotice() {
  const t = useT();
  const me = useMe().data;
  const noRules = me !== undefined && me.policy.length === 0;
  const models = useQuery({ ...myModelsQuery, enabled: me !== undefined && !noRules });
  const noMatch = !noRules && models.data !== undefined && models.data.providers.length === 0;

  if (noMatch) {
    return (
      <p role="status" className={styles.notice}>
        {t("access.noMatch")} {t("access.askCheck")}
      </p>
    );
  }
  if (!noRules) return null;
  return (
    <p role="status" className={styles.notice}>
      {t("access.none")} {me?.policySource === "idp" ? t("access.askIdp") : t("access.askAdmin")}
    </p>
  );
}
