import { useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Select, TextField } from "../../shared/ui";
import { PROXY_MODES, type AccountProxy, type ProxyDraft, type ProxyMode } from "./proxy";

/** The proxy mode and, for an own proxy, its URL. A stored own proxy is shown by host only and kept while the URL stays empty. */
export function ProxyFields({
  value,
  onChange,
  stored,
  error,
}: {
  value: ProxyDraft;
  onChange: (next: ProxyDraft) => void;
  stored?: AccountProxy | undefined;
  error?: string | undefined;
}) {
  const t = useT();
  const keeps = stored?.mode === "custom" && value.mode === "custom";
  const storedURL =
    stored?.url === undefined
      ? t("proxy.unreadable")
      : stored.hasCredentials
        ? `${stored.url} (${t("proxy.withCredentials")})`
        : stored.url;
  return (
    <>
      <Select
        label={t("proxy.mode")}
        hint={t("proxy.modeHint")}
        value={value.mode}
        options={PROXY_MODES.map((mode) => ({ value: mode, label: t(`proxy.${mode}`) }))}
        onChange={(event) => onChange({ ...value, mode: event.target.value as ProxyMode })}
      />
      {value.mode === "custom" && (
        <TextField
          label={t("proxy.url")}
          hint={keeps ? fill(t("proxy.urlKeepHint"), { url: storedURL }) : t("proxy.urlHint")}
          placeholder="http://user:password@proxy.example.com:3128"
          // The URL may carry the proxy's password, as the API key field does.
          type="password"
          value={value.url}
          mono
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange({ ...value, url: event.target.value })}
          error={error}
        />
      )}
    </>
  );
}
