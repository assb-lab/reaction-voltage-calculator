import type { KeyValueStore } from "./onboarding";

export const THEME_KEY = "rvc.theme";
export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Saved theme; "auto" (follow the OS) when unset, invalid or storage is unavailable. */
export function loadTheme(store: KeyValueStore | null): Theme {
  try {
    const t = store?.getItem(THEME_KEY);
    return THEMES.includes(t as Theme) ? (t as Theme) : "auto";
  } catch {
    return "auto";
  }
}

export function saveTheme(store: KeyValueStore | null, theme: Theme): void {
  try {
    store?.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

/** Set `data-theme` on the root element; "auto" removes it so prefers-color-scheme applies. */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
