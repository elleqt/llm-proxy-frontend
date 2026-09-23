import { useQuery } from "@tanstack/react-query";
import { authConfigQuery } from "../../entities/session/authConfig";
import { useMe } from "../../entities/user/me";
import { useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import styles from "./NoModelAccessNotice.module.css";

/**
 * Says so when the user's policy allows no model at all: every request with
 * their keys would be refused. Issuing keys stays possible; they start working
 * once access is granted.
 */
export function NoModelAccessNotice() {
  const t = useT();
  const me = useMe().data;
  const none = me !== undefined && me.policy.length === 0;
  const idp = me?.policySource === "idp";
  // Only an identity-provider policy names the provider.
  const config = useQuery({ ...authConfigQuery, enabled: none && idp });
  if (!none) return null;

  const provider = config.data?.oidc.displayName || t("access.providerFallback");
  return (
    <p role="status" className={styles.notice}>
      {t("access.none")}{" "}
      {idp ? fill(t("access.askIdp"), { provider }) : t("access.askAdmin")}
    </p>
  );
}
