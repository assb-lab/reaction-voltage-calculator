import type { Profile } from "../core/profile";

export function stabilityWindowText(profile: Profile): string {
  if (!profile.targetEntry) return "評価不可 (該当エントリなし)";
  const w = profile.window;
  if (!w) return `${profile.ion} 金属と反応 (0 V 以下)`;
  if (!w.targetIsPhase) return "なし (分解生成物が安定)";
  if (w.high - w.low < 1e-9) return `なし (${w.low.toFixed(3)} V で分解)`;
  return `${w.low.toFixed(3)} – ${w.high === Infinity ? "∞" : w.high.toFixed(3)} V`;
}
