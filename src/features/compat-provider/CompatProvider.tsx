import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { compatDefaultsQuery, providerAccountsQuery, type ProviderAccount } from "../../entities/provider/providers";
import { ApiError, client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Badge, Button, Checkbox, Modal, RefreshIcon, Spinner, TextField, useDiscardGuard } from "../../shared/ui";
import { ProxySection, sectionDraft } from "../account-proxy/ProxySection";
import { proxyChanged, proxyInput } from "../account-proxy/proxy";
import styles from "./CompatProvider.module.css";
import { levelsInput, levelsKind, providerLevels, sameLevels } from "./levels";
import { LEVELS_MARK, ReasoningLevels } from "./ReasoningLevels";

type CompatModel = components["schemas"]["CompatModel"];
type CreateRequest = components["schemas"]["CompatProviderRequest"];
type UpdateRequest = components["schemas"]["CompatProviderUpdate"];
type DiscoverRequest = components["schemas"]["CompatDiscoverRequest"];

/** A model row of the form: offered by discovery or typed, served when picked. */
interface ModelRow {
  name: string;
  alias: string;
  picked: boolean;
}

/**
 * The provider's reasoning list. Untouched, every stored model keeps its own list on save;
 * touched (or Reset), the list goes to every picked model.
 */
type LevelsDraft = { touched: false } | { touched: true; list: string[] };

/**
 * An OpenAI-compatible provider's drawer: a new one (from the "Add provider" wizard)
 * without `account`, an existing one with it. `removeAction` is the footer's remove
 * control, which lives with the page.
 */
export function CompatDrawer({
  account,
  onClose,
  removeAction,
}: {
  account?: ProviderAccount | undefined;
  onClose: () => void;
  removeAction?: ReactNode;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const formId = useId();
  const existing = account?.compat;
  const [name, setName] = useState(existing?.name ?? "");
  const [baseURL, setBaseURL] = useState(existing?.baseURL ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [keyReplacing, setKeyReplacing] = useState(false);
  const [prefix, setPrefix] = useState(existing?.prefix ?? "");
  const [rows, setRows] = useState<ModelRow[]>(() =>
    (existing?.models ?? []).map((m) => ({ name: m.name, alias: m.alias ?? "", picked: true })),
  );
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState("");
  const [pickError, setPickError] = useState(false);
  const [levels, setLevels] = useState<LevelsDraft>({ touched: false });
  const [levelsError, setLevelsError] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Whether a model's list is its own is judged against the default set, so Save waits for it.
  const defaults = useQuery(compatDefaultsQuery);
  const defaultLevels = defaults.data?.reasoningLevels;
  const storedModels = existing?.models;
  const initialLevels = useMemo(
    () => (defaultLevels === undefined ? undefined : providerLevels(storedModels ?? [], defaultLevels)),
    [defaultLevels, storedModels],
  );
  // What the block shows while untouched: `null` while the models differ, so nothing is checked.
  const untouchedList =
    initialLevels === undefined
      ? undefined
      : initialLevels.kind === "own"
        ? initialLevels.levels
        : initialLevels.kind === "default"
          ? defaultLevels
          : null;
  const shownList = levels.touched ? levels.list : untouchedList;
  const [proxy, setProxy] = useState(() => sectionDraft(account?.proxy));
  // A new provider always states its proxy; an edit sends one only when it asks for something else.
  const proxyEdited = account === undefined || proxyChanged(proxy, account.proxy);
  // A stored key is bound to its base URL (the server refuses otherwise): at
  // another URL it is neither offered to discovery nor kept.
  const storedKeyApplies =
    existing?.hasApiKey === true && !clearKey && baseURL.trim().replace(/\/+$/, "") === existing.baseURL.replace(/\/+$/, "");
  const keyNeeded = existing?.hasApiKey === true && !clearKey && !storedKeyApplies && apiKey.trim() === "";
  // Discovery through a stored own proxy names the account, and the server then
  // uses the stored key or refuses to go without one: a stored key that does not
  // apply here (moved URL, or being removed) must be replaced by a typed one first.
  const discoverBlocked =
    account?.proxy.mode === "custom" &&
    !proxyEdited &&
    existing?.hasApiKey === true &&
    !storedKeyApplies &&
    apiKey.trim() === "";
  // A stored key shows as its line until Replace swaps in the field; Remove marks it on the line.
  const keyMode = existing?.hasApiKey !== true ? "field" : clearKey ? "remove" : keyReplacing ? "replace" : "stored";

  const pickedRows = rows.filter((row) => row.picked);
  const dirty =
    name !== (existing?.name ?? "") ||
    baseURL !== (existing?.baseURL ?? "") ||
    prefix !== (existing?.prefix ?? "") ||
    apiKey !== "" ||
    clearKey ||
    // Offered rows left unpicked change nothing that is saved.
    pickedRows.length !== (storedModels?.length ?? 0) ||
    pickedRows.some((row) => {
      const stored = storedModels?.find((m) => m.name === row.name);
      return stored === undefined || row.alias.trim() !== (stored.alias ?? "");
    }) ||
    proxyChanged(proxy, account?.proxy) ||
    (levels.touched && (untouchedList == null || !sameLevels(levels.list, untouchedList)));
  const guard = useDiscardGuard(dirty, onClose);

  // gcTime 0: the typed key is a mutation variable, dropped once the form closes.
  const discover = useMutation({
    mutationFn: (body: DiscoverRequest) => unwrap(client.POST("/api/admin/providers/compat/discover", { body })),
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: async (models: CompatModel[]) => {
      const key = apiKey.trim();
      if (account === undefined) {
        const body: CreateRequest = { name: name.trim(), baseURL: baseURL.trim(), models, proxy: proxyInput(proxy) };
        if (key !== "") body.apiKey = key;
        if (prefix.trim() !== "") body.prefix = prefix.trim();
        return unwrap(client.POST("/api/admin/providers/compat", { body }));
      }
      const body: UpdateRequest = {
        baseURL: baseURL.trim(),
        models,
        prefix: prefix.trim(),
        clearApiKey: key === "" && clearKey,
      };
      if (key !== "") body.apiKey = key;
      if (proxyEdited) body.proxy = proxyInput(proxy);
      return unwrap(
        client.PUT("/api/admin/providers/compat/{accountId}", { params: { path: { accountId: account.id } }, body }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: providerAccountsQuery.queryKey }),
    gcTime: 0,
  });

  const runDiscover = () => {
    const body: DiscoverRequest = { baseURL: baseURL.trim() };
    if (apiKey.trim() !== "") body.apiKey = apiKey.trim();
    // Discovery goes through the proxy the provider will use. A stored own proxy's URL never
    // reaches the browser, so the server is pointed at the account to use it.
    if (proxyEdited) body.proxy = proxyInput(proxy);
    else if (account?.proxy.mode === "custom") body.accountId = account.id;
    else body.proxy = { mode: account?.proxy.mode ?? "inherit" };
    if (account !== undefined && apiKey.trim() === "" && storedKeyApplies) body.accountId = account.id;
    discover.mutate(body, {
      onSuccess: (found) => {
        // Rows already there keep their choice and alias; new ones wait to be picked.
        setRows((current) => [
          ...current,
          ...found.models
            .filter((m) => !current.some((row) => row.name === m))
            .map((m) => ({ name: m, alias: "", picked: false })),
        ]);
        setConflicts(found.conflicts);
      },
    });
  };

  const addTyped = () => {
    const model = typed.trim();
    if (model === "") return;
    setRows((current) =>
      current.some((row) => row.name === model)
        ? current.map((row) => (row.name === model ? { ...row, picked: true } : row))
        : [...current, { name: model, alias: "", picked: true }],
    );
    setTyped("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (defaultLevels === undefined || initialLevels === undefined) return;
    setPickError(pickedRows.length === 0);
    // An empty list would make upstream treat the models as non-thinking and strip the parameter.
    const levelsMissing = levels.touched && levels.list.length === 0;
    setLevelsError(levelsMissing);
    if (levelsMissing) setAdvancedOpen(true);
    if (pickedRows.length === 0 || levelsMissing) return;
    const models = pickedRows.map((row): CompatModel => {
      const model: CompatModel = { name: row.name };
      if (row.alias.trim() !== "") model.alias = row.alias.trim();
      const stored = storedModels?.find((m) => m.name === row.name);
      // Untouched, a stored model keeps exactly what it had; a new one joins a uniform own list.
      const reasoningLevels = levels.touched
        ? levelsInput(levels.list, defaultLevels)
        : stored !== undefined
          ? stored.reasoningLevels
          : initialLevels.kind === "own"
            ? levelsInput(initialLevels.levels, defaultLevels)
            : undefined;
      if (reasoningLevels !== undefined) model.reasoningLevels = reasoningLevels;
      return model;
    });
    save.mutate(models, { onSuccess: onClose });
  };

  const saveError = save.error instanceof ApiError ? save.error : null;
  const onField = (field: string) => (saveError?.field === field ? errorMessage(saveError) : undefined);
  const discoverError = discover.error instanceof ApiError ? discover.error : null;
  const fieldShown =
    saveError?.field !== undefined && ["name", "baseURL", "apiKey", "prefix", "proxy.url"].includes(saveError.field);

  // Focus follows the key controls as they swap: back to Replace, on to Undo, back to Remove.
  const keyFocus = useRef<"replace" | "undo" | "remove" | null>(null);
  const focusWhen = (which: "replace" | "undo" | "remove") => (button: HTMLButtonElement | null) => {
    if (button !== null && keyFocus.current === which) {
      keyFocus.current = null;
      button.focus();
    }
  };

  const connectionId = `${formId}-connection`;
  const keyLabelId = `${formId}-key`;
  const modelsId = `${formId}-models`;
  const advancedId = `${formId}-advanced`;
  const shownKind = defaultLevels === undefined || shownList === undefined ? undefined : levelsKind(shownList, defaultLevels);

  return (
    <>
      <Modal
        open
        variant="drawer"
        onClose={guard.requestClose}
        title={
          account === undefined || existing === undefined ? (
            t("compat.titleAdd")
          ) : (
            <span className={styles.title}>
              {/* Decorative: the page's row says the same in words. */}
              <span aria-hidden className={styles.dot} data-status={account.disabled ? "disabled" : account.status} />
              {existing.name}
            </span>
          )
        }
        footer={
          <>
            <span>{removeAction}</span>
            <span className={styles.actions}>
              <Button onClick={guard.requestClose}>{t("ui.cancel")}</Button>
              <Button
                type="submit"
                form={formId}
                variant="primary"
                busy={save.isPending || defaults.isPending}
                disabled={defaults.isError || (account !== undefined && !dirty)}
              >
                {existing === undefined ? t("compat.save") : t("compat.saveEdit")}
              </Button>
            </span>
          </>
        }
      >
        <form id={formId} className={styles.form} onSubmit={submit} noValidate>
          {existing !== undefined && (
            <p className={styles.sub}>{fill(t("compat.kindLine"), { rule: `${existing.name}:*` })}</p>
          )}

          <section className={styles.section} aria-labelledby={connectionId}>
            <h3 id={connectionId} className={styles.heading}>
              {t("compat.connection")}
            </h3>
            {existing === undefined && (
              <TextField
                label={t("compat.name")}
                hint={t("compat.nameHint")}
                value={name}
                mono
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setName(event.target.value.toLowerCase())}
                error={onField("name")}
              />
            )}
            <TextField
              label={t("compat.baseURL")}
              hint={t("compat.baseURLHint")}
              placeholder="https://api.example.com/v1"
              value={baseURL}
              mono
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setBaseURL(event.target.value)}
              error={onField("baseURL") ?? (discoverError?.field === "baseURL" ? errorMessage(discoverError) : undefined)}
            />
            {keyMode === "stored" || keyMode === "remove" ? (
              <div role="group" aria-labelledby={keyLabelId} className={styles.keyField}>
                <span id={keyLabelId} className={styles.label}>
                  {t("compat.apiKey")}
                </span>
                <div className={styles.keyLine}>
                  {keyMode === "remove" ? (
                    <>
                      <span className={styles.dim}>{t("compat.keyRemoved")}</span>
                      <Button
                        ref={focusWhen("undo")}
                        onClick={() => {
                          keyFocus.current = "remove";
                          setClearKey(false);
                        }}
                      >
                        {t("compat.keyUndo")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span>
                        <span aria-hidden className={styles.mono}>
                          ••••••••
                        </span>{" "}
                        {t("compat.keyStored")}
                      </span>
                      <span className={styles.lineActions}>
                        <Button ref={focusWhen("replace")} onClick={() => setKeyReplacing(true)}>
                          {t("compat.keyReplace")}
                        </Button>
                        <Button
                          ref={focusWhen("remove")}
                          onClick={() => {
                            keyFocus.current = "undo";
                            setClearKey(true);
                          }}
                        >
                          {t("compat.keyRemove")}
                        </Button>
                      </span>
                    </>
                  )}
                </div>
                {keyNeeded && <p className={styles.hint}>{t("compat.apiKeyMovedHint")}</p>}
                {onField("apiKey") !== undefined && <p role="alert">{onField("apiKey")}</p>}
              </div>
            ) : (
              <div className={styles.replace}>
                <TextField
                  label={t("compat.apiKey")}
                  hint={
                    keyNeeded
                      ? t("compat.apiKeyMovedHint")
                      : existing?.hasApiKey
                        ? t("compat.apiKeyKeepHint")
                        : t("compat.apiKeyHint")
                  }
                  type="password"
                  value={apiKey}
                  mono
                  autoFocus={keyMode === "replace"}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setApiKey(event.target.value)}
                  error={onField("apiKey")}
                />
                {keyMode === "replace" && (
                  <Button
                    onClick={() => {
                      keyFocus.current = "replace";
                      setApiKey("");
                      setKeyReplacing(false);
                    }}
                  >
                    {t("compat.keyCancel")}
                  </Button>
                )}
              </div>
            )}
            <TextField
              label={t("compat.prefix")}
              hint={t("compat.prefixHint")}
              value={prefix}
              mono
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setPrefix(event.target.value)}
              error={onField("prefix")}
            />
          </section>

          <ProxySection
            value={proxy}
            onChange={setProxy}
            stored={account?.proxy}
            error={onField("proxy.url") ?? (discoverError?.field === "proxy.url" ? errorMessage(discoverError) : undefined)}
          />

          <section className={styles.section} aria-labelledby={modelsId}>
            <div className={styles.sectionHead}>
              <h3 id={modelsId} className={styles.heading}>
                {t("compat.models")}
              </h3>
              <Button
                onClick={runDiscover}
                busy={discover.isPending}
                disabled={baseURL.trim() === "" || discoverBlocked}
                title={t("compat.refreshHint")}
              >
                <RefreshIcon />
                {t("compat.refresh")}
              </Button>
            </div>
            <span role="status" className={styles.dim}>
              {discover.isSuccess ? fill(t("compat.discovered"), { n: discover.data.models.length }) : ""}
            </span>
            {discoverBlocked && clearKey && <p className={styles.dim}>{t("compat.discoverNeedsKey")}</p>}
            {discover.isError && discoverError?.field !== "baseURL" && discoverError?.field !== "proxy.url" && (
              <p role="alert">{errorMessage(discover.error)}</p>
            )}
            {rows.length === 0 ? (
              <p className={styles.dim}>{t("compat.noModels")}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.check}>
                        <span className={styles.visuallyHidden}>{t("compat.serveColumn")}</span>
                      </th>
                      <th>{t("compat.model")}</th>
                      <th>{t("compat.alias")}</th>
                    </tr>
                  </thead>
                  {rows.map((row) => {
                    const others = conflicts[row.alias.trim() || row.name];
                    return (
                      // One body per model: its row, and its conflict warning under it.
                      <tbody key={row.name}>
                        <tr>
                          <td className={styles.check}>
                            <Checkbox
                              label={
                                <span className={styles.visuallyHidden}>
                                  {fill(t("compat.serve"), { model: row.name })}
                                </span>
                              }
                              checked={row.picked}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((r) => (r.name === row.name ? { ...r, picked: event.target.checked } : r)),
                                )
                              }
                            />
                          </td>
                          <td className={styles.mono}>{row.name}</td>
                          <td>
                            {row.picked && (
                              <TextField
                                label={
                                  <span className={styles.visuallyHidden}>
                                    {fill(t("compat.aliasFor"), { model: row.name })}
                                  </span>
                                }
                                value={row.alias}
                                mono
                                autoComplete="off"
                                spellCheck={false}
                                onChange={(event) =>
                                  setRows((current) =>
                                    current.map((r) => (r.name === row.name ? { ...r, alias: event.target.value } : r)),
                                  )
                                }
                              />
                            )}
                          </td>
                        </tr>
                        {row.picked && others !== undefined && others.length > 0 && (
                          <tr>
                            <td />
                            <td colSpan={2} className={styles.warning}>
                              {fill(t("compat.conflict"), { providers: others.join(", ") })}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
            <div className={styles.row}>
              <TextField
                className={styles.grow}
                label={t("compat.addModel")}
                value={typed}
                mono
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTyped();
                  }
                }}
              />
              <Button onClick={addTyped} disabled={typed.trim() === ""}>
                {t("compat.addModelButton")}
              </Button>
            </div>
            {pickError && <p role="alert">{t("compat.pickModels")}</p>}
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>
              <button
                type="button"
                className={styles.disclosure}
                aria-expanded={advancedOpen}
                aria-controls={advancedId}
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <span>
                  <span aria-hidden className={styles.arrow}>
                    ▸
                  </span>
                  {t("compat.advanced")}
                </span>
                {shownKind !== undefined && (
                  <Badge tone={shownKind === "own" ? "accent" : "muted"}>
                    {`${t("compat.levels")}: ${t(LEVELS_MARK[shownKind])}`}
                  </Badge>
                )}
              </button>
            </h3>
            <div id={advancedId} hidden={!advancedOpen}>
              {defaultLevels !== undefined && shownList !== undefined ? (
                <ReasoningLevels
                  value={shownList}
                  defaults={defaultLevels}
                  onChange={(list) => {
                    setLevelsError(false);
                    setLevels({ touched: true, list });
                  }}
                  error={levelsError ? t("compat.pickLevels") : undefined}
                />
              ) : (
                defaults.isPending && <Spinner label={t("compat.levelsLoading")} />
              )}
            </div>
          </section>

          {/* Once, for the whole form: without the default set no model's levels can be judged, so nothing saves. */}
          {defaults.isError && <p role="alert">{errorMessage(defaults.error)}</p>}
          {save.isError && !fieldShown && <p role="alert">{errorMessage(save.error)}</p>}
        </form>
      </Modal>
      {guard.dialog}
    </>
  );
}
