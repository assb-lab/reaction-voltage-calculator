import { en } from "./en";
import { ja, type MessageKey } from "./ja";

export type { MessageKey };
export const LANGS = ["ja", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_KEY = "rvc.lang";

const dictionaries: Record<Lang, Record<MessageKey, string>> = { ja, en };
let current: Lang = "ja";

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
}

/**
 * Message for the current language with `{name}` placeholders filled in. Parameters are inserted
 * verbatim: escape them first when the message is used as HTML.
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return dictionaries[current][key].replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

/** Japanese for ja-* browsers, English otherwise. */
export function detectLang(languages: readonly string[]): Lang {
  const first = languages.find((l) => /^(ja|en)\b/i.test(l));
  return first?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Saved language, else the browser's. */
export function loadLang(store: Store | null, languages: readonly string[]): Lang {
  try {
    const saved = store?.getItem(LANG_KEY);
    if (LANGS.includes(saved as Lang)) return saved as Lang;
  } catch {
    /* storage unavailable */
  }
  return detectLang(languages);
}

export function saveLang(store: Store | null, lang: Lang): void {
  try {
    store?.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Translate static markup:
 * - `data-i18n="key"` sets textContent
 * - `data-i18n-html="key"` sets innerHTML (dictionary text is trusted markup)
 * - `data-i18n-attr="attr:key;attr:key"` sets attributes
 */
export function translateDom(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]"))
    el.textContent = t(el.dataset.i18n as MessageKey);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]"))
    el.innerHTML = t(el.dataset.i18nHtml as MessageKey);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr!.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key as MessageKey));
    }
  }
}
