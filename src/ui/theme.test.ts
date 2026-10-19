import { describe, expect, it } from "vite-plus/test";
import type { KeyValueStore } from "./onboarding";
import { applyTheme, loadTheme, saveTheme, THEME_KEY } from "./theme";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("theme", () => {
  it("defaults to auto and round-trips a saved choice", () => {
    const store = memoryStore();
    expect(loadTheme(store)).toBe("auto");
    saveTheme(store, "dark");
    expect(store.data.get(THEME_KEY)).toBe("dark");
    expect(loadTheme(store)).toBe("dark");
  });

  it("ignores invalid values and unavailable storage", () => {
    const store = memoryStore();
    store.data.set(THEME_KEY, "sepia");
    expect(loadTheme(store)).toBe("auto");
    expect(loadTheme(null)).toBe("auto");
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadTheme(broken)).toBe("auto");
    expect(() => saveTheme(broken, "light")).not.toThrow();
  });

  it("sets data-theme for explicit choices and clears it for auto", () => {
    const root = { dataset: {} as DOMStringMap } as HTMLElement;
    applyTheme(root, "light");
    expect(root.dataset.theme).toBe("light");
    applyTheme(root, "auto");
    expect(root.dataset.theme).toBeUndefined();
  });
});
