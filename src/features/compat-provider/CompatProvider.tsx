import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { providerAccountsQuery, type ProviderAccount } from "../../entities/provider/providers";
import { ApiError, client, unwrap } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, Checkbox, Modal, TextField } from "../../shared/ui";
import { ProxyFields } from "../account-proxy/ProxyFields";
import { proxyChanged, proxyDraft, proxyInput } from "../account-proxy/proxy";
import styles from "./CompatProvider.module.css";

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

/** The OpenAI-compatible provider form for a new provider, opened from the "Add provider" wizard. */
export function NewCompatProvider({ onClose }: { onClose: () => void }) {
  return <CompatProviderForm onClose={onClose} />;
}

/** The "Edit" action of an OpenAI-compatible provider's row. */
export function EditCompatProvider({ account }: { account: ProviderAccount }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (account.compat === undefined) return null;
  return (
    <>
      <Button aria-label={fill(t("compat.editLabel"), { name: account.compat.name })} onClick={() => setOpen(true)}>
        {t("compat.edit")}
      </Button>
      {open && <CompatProviderForm account={account} onClose={() => setOpen(false)} />}
    </>
  );
}

function CompatProviderForm({ account, onClose }: { account?: ProviderAccount; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const existing = account?.compat;
  const [name, setName] = useState(existing?.name ?? "");
  const [baseURL, setBaseURL] = useState(existing?.baseURL ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [prefix, setPrefix] = useState(existing?.prefix ?? "");
  const [rows, setRows] = useState<ModelRow[]>(() =>
    (existing?.models ?? []).map((m) => ({ name: m.name, alias: m.alias ?? "", picked: true })),
  );
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState("");
  const [pickError, setPickError] = useState(false);
  const [proxy, setProxy] = useState(() => proxyDraft(account?.proxy));
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
          ...found.models.filter((m) => !current.some((row) => row.name === m)).map((m) => ({ name: m, alias: "", picked: false })),
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
    const models = rows
      .filter((row) => row.picked)
      .map((row): CompatModel => (row.alias.trim() === "" ? { name: row.name } : { name: row.name, alias: row.alias.trim() }));
    if (models.length === 0) {
      setPickError(true);
      return;
    }
    setPickError(false);
    save.mutate(models, { onSuccess: onClose });
  };

  const saveError = save.error instanceof ApiError ? save.error : null;
  const onField = (field: string) => (saveError?.field === field ? errorMessage(saveError) : undefined);
  const discoverError = discover.error instanceof ApiError ? discover.error : null;
  const fieldShown =
    saveError?.field !== undefined && ["name", "baseURL", "apiKey", "prefix", "proxy.url"].includes(saveError.field);

  return (
    <Modal
      open
      // A typed key is lost on close: no closing by a stray click.
      closeOnBackdrop={false}
      onClose={onClose}
      title={existing === undefined ? t("compat.titleAdd") : fill(t("compat.titleEdit"), { name: existing.name })}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t("compat.name")}
          hint={t("compat.nameHint")}
          value={name}
          mono
          autoFocus={existing === undefined}
          readOnly={existing !== undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.target.value.toLowerCase())}
          error={onField("name")}
        />
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
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setApiKey(event.target.value)}
          error={onField("apiKey")}
        />
        {existing?.hasApiKey && apiKey === "" && (
          <Checkbox label={t("compat.clearKey")} checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
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
        <ProxyFields
          value={proxy}
          onChange={setProxy}
          stored={account?.proxy}
          error={onField("proxy.url") ?? (discoverError?.field === "proxy.url" ? errorMessage(discoverError) : undefined)}
        />

        <fieldset className={styles.models}>
          <legend>{t("compat.models")}</legend>
          <div className={styles.row}>
            <Button onClick={runDiscover} busy={discover.isPending} disabled={baseURL.trim() === "" || discoverBlocked}>
              {t("compat.discover")}
            </Button>
            <span role="status" className={styles.dim}>
              {discover.isSuccess ? fill(t("compat.discovered"), { n: discover.data.models.length }) : ""}
            </span>
            {discoverBlocked && clearKey && <span className={styles.dim}>{t("compat.discoverNeedsKey")}</span>}
          </div>
          {discover.isError && discoverError?.field !== "baseURL" && discoverError?.field !== "proxy.url" && (
            <p role="alert">{errorMessage(discover.error)}</p>
          )}
          {rows.length === 0 ? (
            <p className={styles.dim}>{t("compat.noModels")}</p>
          ) : (
            <ul className={styles.list}>
              {rows.map((row) => {
                const others = conflicts[row.alias.trim() || row.name];
                return (
                  <li key={row.name} className={styles.model}>
                    <Checkbox
                      label={<span className={styles.mono}>{row.name}</span>}
                      aria-label={fill(t("compat.serve"), { model: row.name })}
                      checked={row.picked}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((r) => (r.name === row.name ? { ...r, picked: event.target.checked } : r)),
                        )
                      }
                    />
                    {row.picked && (
                      <TextField
                        label={fill(t("compat.aliasFor"), { model: row.name })}
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
                    {row.picked && others !== undefined && others.length > 0 && (
                      <p className={styles.warning}>{fill(t("compat.conflict"), { providers: others.join(", ") })}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.row}>
            <TextField
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
        </fieldset>

        {save.isError && !fieldShown && <p role="alert">{errorMessage(save.error)}</p>}
        <div className={styles.actions}>
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" busy={save.isPending}>
            {existing === undefined ? t("compat.save") : t("compat.saveEdit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
