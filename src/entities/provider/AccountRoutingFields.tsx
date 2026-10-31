import { useEffect, useState } from "react";
import { useT } from "../../shared/i18n";
import { Select, TextField } from "../../shared/ui";

export function priorityValue(value: string): number | undefined {
  if (!/^-?\d+$/.test(value.trim())) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : undefined;
}

export function RoutingRoleSelect({ value, onChange, label, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const custom = !["1", "0", "-1"].includes(value);
  return <Select
    label={label ?? t("routing.role")}
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    options={[
      { value: "1", label: t("routing.preferred") },
      { value: "0", label: t("routing.normal") },
      { value: "-1", label: t("routing.reserve") },
      ...(custom ? [{ value, label: `${t("routing.custom")} (${value})`, disabled: true }] : []),
    ]}
  />;
}

/** Controlled draft: the enclosing form owns validation and persistence. */
export function AccountRoutingFields({ value, onChange, error }: {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const t = useT();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => { if (error) setAdvancedOpen(true); }, [error]);
  return <section>
    <RoutingRoleSelect value={value} onChange={onChange} />
    <p>{t("routing.hint")}</p>
    <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
      <summary>{t("routing.advanced")}</summary>
      <TextField label={t("routing.priority")} type="number" step="1" min="-2147483648" max="2147483647"
        value={value} onChange={(event) => onChange(event.target.value)} error={error} />
    </details>
  </section>;
}
