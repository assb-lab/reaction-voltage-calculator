import { describe, expect, it } from "vite-plus/test";
import {
  markOnboarded,
  ONBOARDING_KEY,
  shouldShowOnboarding,
  type KeyValueStore,
} from "./onboarding";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("onboarding", () => {
  it("shows on the first visit and hides after dismissal", () => {
    const store = memoryStore();
    expect(shouldShowOnboarding(store)).toBe(true);
    markOnboarded(store);
    expect(store.data.get(ONBOARDING_KEY)).toBe("1");
    expect(shouldShowOnboarding(store)).toBe(false);
  });

  it("falls back to showing when storage is missing or throws", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(shouldShowOnboarding(null)).toBe(true);
    expect(shouldShowOnboarding(broken)).toBe(true);
    expect(() => markOnboarded(broken)).not.toThrow();
  });
});
