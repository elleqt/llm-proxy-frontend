import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { applyLang, currentLang, type Lang } from "../lib/preferences";
import { en, type MessageKey, type Messages } from "./en";
import { ru } from "./ru";

const dictionaries: Record<Lang, Messages> = { en, ru };

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(currentLang);
  useEffect(() => {
    document.title = dictionaries[lang]["app.title"];
  }, [lang]);
  const setLang = (next: Lang) => {
    applyLang(next);
    setLangState(next);
  };
  return <I18nContext value={{ lang, setLang }}>{children}</I18nContext>;
}

function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (i18n === null) throw new Error("useT/useLang outside I18nProvider");
  return i18n;
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const { lang, setLang } = useI18n();
  return [lang, setLang];
}

export function useT(): (key: MessageKey) => string {
  const messages = dictionaries[useI18n().lang];
  return (key) => messages[key];
}

/**
 * A screen whose failures need their own wording: the key
 * `errorIn.<context>.<code>` overrides `error.<code>` there. `password` is the
 * change-password screen, where a 401 `invalid_credentials` means the current
 * (or expired temporary) password, not a sign-in.
 */
export type ErrorContext = "password";

/**
 * Text for a failure, from the dictionary by error code — never the server's
 * `message`. A code the dictionary does not know becomes a generic refusal
 * (403) or a generic failure, never the raw code.
 */
export function errorMessage(messages: Messages, error: unknown, context?: ErrorContext): string {
  if (!(error instanceof ApiError)) return messages["error.unknown"];
  const keys = [`error.${error.code}`];
  if (context !== undefined) keys.unshift(`errorIn.${context}.${error.code}`);
  const key = keys.find((candidate) => Object.hasOwn(messages, candidate));
  if (key !== undefined) return messages[key as MessageKey];
  return messages[error.status === 403 ? "error.forbidden" : "error.unknown"];
}

export function useErrorMessage(context?: ErrorContext): (error: unknown) => string {
  const messages = dictionaries[useI18n().lang];
  return (error) => errorMessage(messages, error, context);
}
