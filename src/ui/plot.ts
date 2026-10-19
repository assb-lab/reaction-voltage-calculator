import { formatNumber } from "../core/formula";
import { atomicFractions, type Profile } from "../core/profile";

const W = 780;
const H = 460;
const M = { top: 20, right: 12, bottom: 52, left: 60 };
const PROFILE_W = 470;
const GAP = 18;

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/** Formula with subscripted numbers as SVG tspans. */
export function formulaTspans(name: string): string {
  return name
    .split(/(?<=[A-Za-z)\]])(\d+(?:\.\d+)?)/)
    .map((part, i) =>
      i % 2 ? `<tspan class="sub" dy="3">${part}</tspan><tspan dy="-3">​</tspan>` : esc(part),
    )
    .join("");
}

/** Approximate rendered width (px) of a formula label at 11px, subscripts included. */
export function labelWidth(name: string): number {
  let w = 0;
  for (const c of name) w += /\d|\./.test(c) ? 5 : /[A-Z]/.test(c) ? 7.5 : 6;
  return w;
}

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}

function ticks(lo: number, hi: number, target: number): number[] {
  const step = niceStep(hi - lo, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step)
    out.push(Number(v.toFixed(10)));
  return out;
}

/** Upper voltage shown on the axis. */
export function voltageTop(profile: Profile): number {
  const vs = profile.plateaus.map((p) => p.voltage);
  const hi = Math.max(1, ...vs);
  return Math.ceil(hi + 0.5);
}

/** SVG of the voltage profile (left) and the voltage-resolved phase equilibria (right). */
export function renderProfileSvg(profile: Profile): string {
  const { regions, plateaus, window } = profile;
  const vTop = voltageTop(profile);
  const xs = regions.map((r) => r.x);
  let xLo = Math.min(0, ...xs);
  let xHi = Math.max(0, ...xs);
  const pad = Math.max(0.5, (xHi - xLo) * 0.06);
  xLo -= pad;
  xHi += pad;

  const plotB = H - M.bottom;
  const X = (x: number) => M.left + ((x - xLo) / (xHi - xLo)) * (PROFILE_W - M.left);
  const Y = (v: number) => M.top + (1 - Math.min(v, vTop) / vTop) * (plotB - M.top);
  const phaseL = PROFILE_W + GAP;
  const phaseR = W - M.right;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="profile-svg" role="img" aria-label="${esc(
      `${profile.formula} の ${profile.ion} 電位プロファイルと相平衡`,
    )}">`,
  );
  parts.push(`<style>
    .profile-svg { font-family: system-ui, sans-serif; font-size: 12px; }
    .profile-svg .axis { stroke: var(--fg, #222); stroke-width: 1; fill: none; }
    .profile-svg .grid { stroke: var(--grid, #ddd); stroke-width: 1; }
    .profile-svg text { fill: var(--fg, #222); }
    .profile-svg .muted { fill: var(--muted, #666); }
    .profile-svg .sub { font-size: 0.75em; }
    .profile-svg .ox { stroke: var(--ox, #d62728); }
    .profile-svg .red { stroke: var(--red, #1f5fbf); }
    .profile-svg .neutral { stroke: var(--fg, #222); }
    .profile-svg .window { fill: var(--window, #bbb); fill-opacity: 0.45; }
    .profile-svg .box { fill: var(--box, #f3f3f3); stroke: var(--fg, #222); stroke-width: 1; }
    .profile-svg .box.ox { fill: var(--ox-bg, #fbe3e3); }
    .profile-svg .box.red { fill: var(--red-bg, #dde7f7); }
    .profile-svg .box.target { fill: var(--window, #bbb); fill-opacity: 0.6; }
    .profile-svg .cell-label { font-size: 11px; }
  </style>`);

  // Stability window band across both panels.
  if (window?.targetIsPhase && window.high > window.low + 1e-9) {
    const y1 = Y(Math.min(window.high, vTop));
    const y0 = Y(window.low);
    parts.push(
      `<rect class="window" x="${M.left}" y="${y1}" width="${phaseR - M.left}" height="${y0 - y1}"/>`,
    );
  }

  // Axes, grid and ticks.
  for (const v of ticks(0, vTop, 6)) {
    parts.push(`<line class="grid" x1="${M.left}" x2="${PROFILE_W}" y1="${Y(v)}" y2="${Y(v)}"/>`);
    parts.push(
      `<text x="${M.left - 6}" y="${Y(v) + 4}" text-anchor="end">${formatNumber(v)}</text>`,
    );
  }
  for (const x of ticks(xLo, xHi, 7)) {
    parts.push(`<line class="axis" x1="${X(x)}" x2="${X(x)}" y1="${plotB}" y2="${plotB + 5}"/>`);
    parts.push(
      `<text x="${X(x)}" y="${plotB + 18}" text-anchor="middle">${formatNumber(x)}</text>`,
    );
  }
  parts.push(
    `<rect class="axis" x="${M.left}" y="${M.top}" width="${PROFILE_W - M.left}" height="${plotB - M.top}"/>`,
  );
  parts.push(
    `<text x="16" y="${(M.top + plotB) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(M.top + plotB) / 2})">Voltage (V) vs ${esc(
      profile.ion,
    )}/${esc(profile.ion)}${profile.charge > 1 ? profile.charge : ""}+</text>`,
  );
  parts.push(
    `<text x="${(M.left + PROFILE_W) / 2}" y="${H - 12}" text-anchor="middle">${esc(profile.ion)} uptake per ${formulaTspans(
      profile.formula,
    )}</text>`,
  );

  // Step profile: vertical segments are regions, horizontal ones plateaus.
  const cls = (x0: number, x1: number) =>
    x1 <= 1e-9 && x0 < -1e-9 ? "ox" : x0 >= -1e-9 && x1 > 1e-9 ? "red" : "neutral";
  const seg = (x0: number, y0: number, x1: number, y1: number, c: string) =>
    parts.push(
      `<line class="${c}" stroke-width="2.5" stroke-linecap="square" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}"/>`,
    );
  regions.forEach((r) => {
    const c = Math.abs(r.x) < 1e-9 ? "neutral" : r.x < 0 ? "ox" : "red";
    seg(r.x, Math.min(r.vMax, vTop), r.x, r.vMin, c);
  });
  plateaus.forEach((p) => {
    if (p.xStart < 0 && p.xEnd > 0) {
      seg(p.xStart, p.voltage, 0, p.voltage, "ox");
      seg(0, p.voltage, p.xEnd, p.voltage, "red");
    } else {
      seg(p.xStart, p.voltage, p.xEnd, p.voltage, cls(p.xStart, p.xEnd));
    }
  });
  parts.push(
    `<line class="grid" stroke-dasharray="3 3" x1="${X(0)}" x2="${X(0)}" y1="${M.top}" y2="${plotB}"/>`,
  );
  parts.push(`<text x="${X(0) + 4}" y="${M.top + 14}">${formulaTspans(profile.formula)}</text>`);
  if (xs.some((x) => x < -1e-9))
    parts.push(`<text class="muted" x="${M.left + 6}" y="${plotB - 8}">← Oxidation</text>`);
  if (xs.some((x) => x > 1e-9))
    parts.push(
      `<text class="muted" x="${PROFILE_W - 6}" y="${plotB - 8}" text-anchor="end">Reduction →</text>`,
    );

  // Phase equilibria: each voltage band is split into one cell per phase, with widths (and
  // therefore areas within the band) proportional to the atomic fraction of that phase.
  parts.push(
    `<text x="${(phaseL + phaseR) / 2}" y="${H - 12}" text-anchor="middle">Phase equilibria</text>`,
  );
  regions.forEach((r) => {
    const yTop = Y(Math.min(r.vMax, vTop));
    const yBot = Y(r.vMin);
    const h = yBot - yTop;
    if (h <= 0) return;
    const side =
      Math.abs(r.x) < 1e-9 ? (window?.targetIsPhase ? "target" : "") : r.x < 0 ? "ox" : "red";
    const range = `${formatNumber(r.vMin, 3)}–${r.vMax === Infinity ? "∞" : formatNumber(r.vMax, 3)} V`;
    const fractions = atomicFractions(r);
    let x0 = phaseL;
    r.phases.forEach((ph, i) => {
      const w = (phaseR - phaseL) * fractions[i];
      const pct = formatNumber(fractions[i] * 100, 1);
      parts.push(
        `<g class="cell"><title>${esc(`${ph.entry.name}: ${pct} at.% (${formatNumber(ph.amount)} per ${profile.formula}), ${range}`)}</title>`,
      );
      parts.push(`<rect class="box ${side}" x="${x0}" y="${yTop}" width="${w}" height="${h}"/>`);
      // Label only when it fits; narrow cells rely on the tooltip.
      if (h >= 13 && w >= labelWidth(ph.entry.name) + 4) {
        parts.push(
          `<text class="cell-label" x="${x0 + w / 2}" y="${yTop + h / 2 + 4}" text-anchor="middle">${formulaTspans(ph.entry.name)}</text>`,
        );
      }
      parts.push(`</g>`);
      x0 += w;
    });
  });
  parts.push(`</svg>`);
  return parts.join("\n");
}
