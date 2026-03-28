"use client";

import { createContext, useContext } from "react";
import { t, type SupportedLang } from "./i18n";

type I18nContextType = {
  lang: SupportedLang;
  t: (key: string) => string;
  locale: string;
};

const I18nContext = createContext<I18nContextType>({
  lang: "de",
  t: (key: string) => t(key, "de"),
  locale: "de-DE",
});

export function I18nProvider({ lang, children }: { lang: SupportedLang; children: React.ReactNode }) {
  const locale = lang === "en" ? "en-GB" : "de-DE";
  const translate = (key: string) => t(key, lang);
  return (
    <I18nContext.Provider value={{ lang, t: translate, locale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function formatDate(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale);
}

export function formatDateTime(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(locale);
}

export function formatTime(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(locale);
}
