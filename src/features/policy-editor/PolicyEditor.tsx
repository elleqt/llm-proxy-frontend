import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { adminUserQuery, adminUsersQuery, type AdminUser } from "../../entities/user/adminUsers";
import { ApiError, client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, TextField } from "../../shared/ui";
import styles from "./PolicyEditor.module.css";

/** How long typing must pause before the preview is asked again. */
export const PREVIEW_DEBOUNCE_MS = 300;

const catalogQuery = queryOptions({
  queryKey: ["admin", "catalog"],
  queryFn: ({ signal }) => unwrap(client.GET("/api/admin/catalog", { signal })),
});

const previewQuery = (rules: readonly string[]) =>
  queryOptions({
    queryKey: ["admin", "policy-preview", rules],
    queryFn: ({ signal }) => unwrap(client.POST("/api/admin/policy/preview", { body: { rules: [...rules] }, signal })),
    placeholderData: keepPreviousData,
  });

interface Row {
  key: number;
  provider: string;
  pattern: string;
}

let nextRowKey = 0;

function toRow(rule: string): Row {
  const colon = rule.indexOf(":");
  return colon === -1
    ? { key: nextRowKey++, provider: rule, pattern: "" }
    : { key: nextRowKey++, provider: rule.slice(0, colon), pattern: rule.slice(colon + 1) };
}

/** The rule a row stands for; `null` for a row left entirely blank. */
function ruleOf(row: Row): string | null {
  const provider = row.provider.trim();
  const pattern = row.pattern.trim();
  return provider === "" && pattern === "" ? null : `${provider}:${pattern}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * The access policy of one account: rules "provider + model pattern", with
 * suggestions from the live catalogue and a preview of what they cover today.
 * Read-only when the identity provider's groups own the policy.
 */
export function PolicyEditor({ user }: { user: AdminUser }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const listId = useId();
  const readOnly = user.policySource === "idp";
  const [rows, setRows] = useState(() => user.policy.map(toRow));
  const [saved, setSaved] = useState(false);

  const rules = rows.map(ruleOf).filter((rule) => rule !== null);
  const rulesKey = JSON.stringify(rules);
  const debouncedKey = useDebounced(rulesKey, PREVIEW_DEBOUNCE_MS);
  const previewRules = JSON.parse(debouncedKey) as string[];

  const catalog = useQuery(catalogQuery);
  const preview = useQuery(previewQuery(previewRules));

  const save = useMutation({
    mutationFn: (policy: string[]) =>
      unwrap(client.PATCH("/api/admin/users/{userId}", { params: { path: { userId: user.id } }, body: { policy } })),
    onSuccess: (updated) => {
      queryClient.setQueryData(adminUserQuery(user.id).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: adminUsersQuery.queryKey, exact: true });
      setSaved(true);
    },
  });

  const edit = (key: number, change: Partial<Row>) => {
    setSaved(false);
    save.reset();
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };
  const remove = (key: number) => {
    setSaved(false);
    save.reset();
    setRows((current) => current.filter((row) => row.key !== key));
  };
  const add = () => {
    setSaved(false);
    setRows((current) => [...current, { key: nextRowKey++, provider: "", pattern: "" }]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(rules);
  };

  // A rule's error: from the save refusal (`field` is the rule), else from the preview.
  const saveRuleError =
    save.error instanceof ApiError && save.error.code === "invalid_rule" && save.error.field !== undefined
      ? save.error
      : null;
  const ruleError = (rule: string | null): string | null => {
    if (rule === null) return null;
    if (saveRuleError?.field === rule) return errorMessage(saveRuleError);
    // Only errors for what the preview was asked about: a rule typed since has not been checked.
    const found = debouncedKey === rulesKey ? preview.data?.errors.find((error) => error.rule === rule) : undefined;
    return found === undefined ? null : errorMessage(new ApiError(422, found.code, found.rule));
  };

  const providers = catalog.data?.providers ?? [];
  const dirty = rulesKey !== JSON.stringify(user.policy);
  const covered = preview.data?.covered ?? [];

  return (
    <div className={styles.editor}>
      <form onSubmit={submit} noValidate className={styles.rules}>
        {readOnly && (
          <p className={styles.note} role="note">
            {t("policy.idpReadOnly")}
          </p>
        )}
        <datalist id={`${listId}-providers`}>
          {providers.map((provider) => (
            <option key={provider.name} value={provider.name} />
          ))}
        </datalist>
        {rows.length === 0 && <p className={styles.dim}>{t("policy.noRules")}</p>}
        <ol className={styles.list}>
          {rows.map((row, index) => {
            const rule = ruleOf(row);
            const error = ruleError(rule);
            const models = providers.find((provider) => provider.name === row.provider.trim())?.models ?? [];
            const modelsId = `${listId}-models-${row.key}`;
            const n = index + 1;
            return (
              <li key={row.key} className={styles.row}>
                <div className={styles.fields}>
                  <TextField
                    label={fill(t("policy.provider"), { n })}
                    value={row.provider}
                    readOnly={readOnly}
                    mono
                    autoComplete="off"
                    list={`${listId}-providers`}
                    onChange={(event) => edit(row.key, { provider: event.target.value })}
                  />
                  <span aria-hidden="true" className={styles.colon}>
                    :
                  </span>
                  <TextField
                    label={fill(t("policy.pattern"), { n })}
                    value={row.pattern}
                    readOnly={readOnly}
                    mono
                    autoComplete="off"
                    list={modelsId}
                    onChange={(event) => edit(row.key, { pattern: event.target.value })}
                    error={error ?? undefined}
                  />
                  <datalist id={modelsId}>
                    <option value="*" />
                    {models.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  {!readOnly && (
                    <Button
                      className={styles.remove}
                      aria-label={fill(t("policy.removeRule"), { rule: rule ?? String(n) })}
                      onClick={() => remove(row.key)}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!readOnly && (
          <>
            <p className={styles.dim}>{t("policy.hint")}</p>
            <div className={styles.actions}>
              <Button onClick={add}>{t("policy.addRule")}</Button>
              <Button type="submit" variant="primary" busy={save.isPending} disabled={!dirty}>
                {t("policy.save")}
              </Button>
            </div>
            {save.isError && saveRuleError === null && <p role="alert">{errorMessage(save.error)}</p>}
            <p role="status" className={styles.dim}>
              {saved && !dirty ? t("policy.saved") : ""}
            </p>
          </>
        )}
      </form>

      <section className={styles.preview} aria-labelledby={`${listId}-preview`} aria-busy={preview.isFetching}>
        <h3 id={`${listId}-preview`} className={styles.previewTitle}>
          {t("policy.preview")}
        </h3>
        <p className={styles.note}>{t("policy.wildcardNote")}</p>
        {preview.isError ? (
          <p role="alert">{errorMessage(preview.error)}</p>
        ) : preview.data === undefined ? (
          <p className={styles.dim}>{t("app.loading")}</p>
        ) : covered.length === 0 ? (
          <p>{t("policy.coversNothing")}</p>
        ) : (
          <>
            <p>{fill(t("policy.covers"), { count: covered.length })}</p>
            <ul aria-label={t("policy.coveredModels")} className={styles.covered}>
              {covered.map((entry) => (
                <li key={`${entry.provider}:${entry.model}`}>
                  <code>
                    {entry.provider}:{entry.model}
                  </code>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
