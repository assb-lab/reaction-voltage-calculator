import { afterEach, describe, expect, it } from "vite-plus/test";
import { en } from "./en";
import { ja, type MessageKey } from "./ja";
import { detectLang, getLang, LANG_KEY, loadLang, saveLang, setLang, t } from ".";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n", () => {
  afterEach(() => setLang("ja"));

  it("has the same keys and placeholders in every language", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
    for (const key of Object.keys(ja) as MessageKey[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(ja[key]));
      expect(en[key].trim(), key).not.toBe("");
    }
  });

  it("fills placeholders for the current language", () => {
    expect(getLang()).toBe("ja");
    expect(t("summary.noneAt", { v: "1.500" })).toBe("なし (1.500 V で分解)");
    setLang("en");
    expect(t("summary.noneAt", { v: "1.500" })).toBe("None (decomposes at 1.500 V)");
    expect(t("io.missingPages", { total: 4, docs: 2, pages: 1 })).toMatch(/Only 2 of 4/);
  });

  it("detects the browser language and prefers a saved choice", () => {
    expect(detectLang(["ja-JP", "en-US"])).toBe("ja");
    expect(detectLang(["en-GB", "ja"])).toBe("en");
    expect(detectLang(["de-DE"])).toBe("en");
    expect(detectLang([])).toBe("en");
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(loadLang(store, ["ja"])).toBe("ja");
    saveLang(store, "en");
    expect(data.get(LANG_KEY)).toBe("en");
    expect(loadLang(store, ["ja"])).toBe("en");
    data.set(LANG_KEY, "fr");
    expect(loadLang(store, ["ja"])).toBe("ja");
  });
});
