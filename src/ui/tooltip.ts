import { formatNumber } from "../core/formula";
import { atomicFractions, regionReaction, type PhaseAmount, type Profile } from "../core/profile";
import { formulaHtml, escapeHtml } from "./html";
import { LAYOUT, scales, type View } from "./plot";

/** What is under the pointer. */
export type Hit =
  | { kind: "region"; region: number; voltage: number }
  | { kind: "plateau"; plateau: number }
  | { kind: "cell"; region: number; phase: number; voltage: number };

const PLATEAU_TOL = 5; // SVG px

/** Region whose voltage interval contains v (top region is open-ended). */
export function regionAt(profile: Profile, v: number): number {
  const i = profile.regions.findIndex((r) => v >= r.vMin && v < r.vMax);
  return i >= 0 ? i : v < 0 ? profile.regions.length - 1 : 0;
}

/** Hit-test an SVG point against the figure for a view. */
export function hitTest(profile: Profile, view: View, px: number, py: number): Hit | null {
  const L = LAYOUT;
  if (py < L.top || py > L.bottom) return null;
  const s = scales(view);
  const v = s.vAt(py);
  if (px >= L.profileL && px <= L.profileR) {
    const x = s.xAt(px);
    const tolX = (PLATEAU_TOL / (L.profileR - L.profileL)) * (view.xMax - view.xMin);
    const plateau = profile.plateaus.findIndex(
      (p) =>
        Math.abs(s.Y(p.voltage) - py) <= PLATEAU_TOL &&
        x >= Math.min(p.xStart, p.xEnd) - tolX &&
        x <= Math.max(p.xStart, p.xEnd) + tolX,
    );
    if (plateau >= 0) return { kind: "plateau", plateau };
    return { kind: "region", region: regionAt(profile, v), voltage: v };
  }
  if (px >= L.phaseL && px <= L.phaseR) {
    const region = regionAt(profile, v);
    const fr = atomicFractions(profile.regions[region]);
    let t = (px - L.phaseL) / (L.phaseR - L.phaseL);
    let phase = 0;
    while (phase < fr.length - 1 && t > fr[phase]) t -= fr[phase++];
    return { kind: "cell", region, phase, voltage: v };
  }
  return null;
}

/** Region index the hit belongs to (for linked highlighting). */
export function hitRegion(profile: Profile, hit: Hit): number {
  return hit.kind === "plateau" ? profile.plateaus[hit.plateau].region : hit.region;
}

const fmtV = (v: number) => (v === Infinity ? "∞" : v.toFixed(3));

function phaseList(phases: PhaseAmount[], fractions: number[]): string {
  return phases
    .map(
      (p, i) =>
        `<li>${formatNumber(p.amount)} ${formulaHtml(p.entry.name)} <span class="muted">(${formatNumber(fractions[i] * 100, 1)} at.%)</span></li>`,
    )
    .join("");
}

/** Tooltip body (HTML) for a hit. All data-derived text is escaped. */
export function tooltipHtml(profile: Profile, hit: Hit): string {
  const ion = escapeHtml(profile.ion);
  if (hit.kind === "plateau") {
    const p = profile.plateaus[hit.plateau];
    const a = profile.regions[p.region];
    const b = profile.regions[p.region + 1];
    const dx = p.xEnd - p.xStart;
    const side = (ph: PhaseAmount[]) =>
      ph.map((q) => `${formatNumber(q.amount)} ${formulaHtml(q.entry.name)}`).join(" + ");
    return `<strong>プラトー ${p.voltage.toFixed(3)} V</strong>
      <div>x: ${formatNumber(p.xStart)} → ${formatNumber(p.xEnd)} (${ion} ${formatNumber(dx)} 取込)</div>
      <div class="rxn">${side(a.phases)} + ${formatNumber(dx)} ${ion} → ${side(b.phases)}</div>`;
  }
  const r = profile.regions[hit.region];
  const fr = atomicFractions(r);
  const range = `${fmtV(r.vMin)} – ${fmtV(r.vMax)} V`;
  if (hit.kind === "cell") {
    const ph = r.phases[hit.phase];
    const e = ph.entry;
    const ehull =
      e.eAboveHull === undefined
        ? ""
        : `<div>E<sub>hull</sub> (MP): ${formatNumber(e.eAboveHull * 1000, 1)} meV/atom</div>`;
    return `<strong>${formulaHtml(e.name)}</strong> <span class="muted">${escapeHtml(e.id)}</span>
      <div>${formatNumber(fr[hit.phase] * 100, 1)} at.% / ${formatNumber(ph.amount)} per ${formulaHtml(profile.formula)}</div>
      ${ehull}<div>電位範囲: ${range}</div>`;
  }
  return `<strong>${hit.voltage.toFixed(3)} V</strong> <span class="muted">(区間 ${range})</span>
    <div>x = ${formatNumber(r.x)}</div>
    <ul>${phaseList(r.phases, fr)}</ul>
    <div class="rxn">${formulaHtml(regionReaction(profile, r))}</div>`;
}
