import type { Profile } from "../core/profile";
import { t } from "../i18n";

export function stabilityWindowText(profile: Profile): string {
  if (!profile.targetEntry) return t("summary.notEvaluable");
  const w = profile.window;
  if (!w) return t("summary.reactsWithMetal", { ion: profile.ion });
  if (!w.targetIsPhase) return t("summary.noneDecomposed");
  if (w.high - w.low < 1e-9) return t("summary.noneAt", { v: w.low.toFixed(3) });
  return `${w.low.toFixed(3)} – ${w.high === Infinity ? "∞" : w.high.toFixed(3)} V`;
}
