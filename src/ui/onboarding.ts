export const ONBOARDING_KEY = "rvc.onboarded";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Show the guide until the user has dismissed it once. Unavailable storage counts as a first visit. */
export function shouldShowOnboarding(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(ONBOARDING_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markOnboarded(store: KeyValueStore | null): void {
  try {
    store?.setItem(ONBOARDING_KEY, "1");
  } catch {
    /* storage unavailable: the guide simply shows again next time */
  }
}
