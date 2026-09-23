import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authConfigQuery } from "../../entities/session/authConfig";
import { useMe } from "../../entities/user/me";
import { myModelsQuery } from "../../entities/user/myModels";
import { useErrorMessage, useLang, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Badge, Card, EmptyState, Spinner } from "../../shared/ui";
import styles from "./AvailableModels.module.css";

const CONFIRMATION_MS = 2000;

/** The user's rules, where they come from, and the models they match today. */
export function AvailableModels() {
  const t = useT();
  const me = useMe().data;
  const idp = me?.policySource === "idp";
  const config = useQuery({ ...authConfigQuery, enabled: idp });
  const provider = config.data?.oidc.displayName || t("access.providerFallback");

  return (
    <Card title={t("models.title")}>
      {me !== undefined && (
        <div className={styles.rules}>
          <p>{idp ? fill(t("models.rulesIdp"), { provider }) : t("models.rulesLocal")}</p>
          {me.policy.length === 0 ? (
            <p className={styles.dim}>{t("models.noRules")}</p>
          ) : (
            <ul className={styles.ruleList} aria-label={t("models.rules")}>
              {me.policy.map((rule) => (
                <li key={rule}>
                  <code>{rule}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ModelList />
    </Card>
  );
}

function ModelList() {
  const t = useT();
  const [lang] = useLang();
  const errorMessage = useErrorMessage();
  const models = useQuery(myModelsQuery);
  // One polite region for the whole list, not one per copy button.
  const [copy, setCopy] = useState<{ model: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (copy?.ok !== true) return;
    const timer = setTimeout(() => setCopy(null), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copy]);

  if (models.isPending) return <Spinner label={t("app.loading")} />;
  if (models.isError) return <p role="alert">{errorMessage(models.error)}</p>;
  if (models.data.providers.length === 0) return <EmptyState title={t("models.empty")} />;

  const count = new Intl.NumberFormat(lang);
  const copyModel = async (model: string) => {
    try {
      await navigator.clipboard.writeText(model);
      setCopy({ model, ok: true });
    } catch {
      setCopy({ model, ok: false });
    }
  };

  return (
    <>
      {/* In the server's order: providers by name, models sorted within each. */}
      {models.data.providers.map((group) => (
        <section key={group.name} className={styles.provider} aria-labelledby={`models-${group.name}`}>
          <h3 id={`models-${group.name}`} className={styles.providerName}>
            <span>{group.name}</span>
            <Badge>{count.format(group.models.length)}</Badge>
          </h3>
          <ul className={styles.models}>
            {group.models.map((model) => (
              <li key={model} className={styles.model}>
                <code className={styles.id}>{model}</code>
                <button
                  type="button"
                  className={styles.copy}
                  aria-label={fill(t("models.copy"), { model })}
                  onClick={() => void copyModel(model)}
                >
                  {copy?.ok === true && copy.model === model ? t("ui.copied") : t("ui.copy")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p role="status" className={copy?.ok === false ? styles.failed : styles.visuallyHidden}>
        {copy === null ? "" : copy.ok ? fill(t("models.copied"), { model: copy.model }) : t("ui.copyFailed")}
      </p>
    </>
  );
}
