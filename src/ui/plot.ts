import { formatNumber } from "../core/formula";
import { atomicFractions, type Profile } from "../core/profile";

/** Figure geometry in SVG user units (shared with the interaction layer). */
export const LAYOUT = (() => {
  const W = 780;
  const H = 460;
  const M = { top: 20, right: 12, bottom: 52, left: 60 };
  const profileR = 470;
  const phaseL = profileR + 18;
  return {
    W,
    H,
    top: M.top,
    bottom: H - M.bottom,
    profileL: M.left,
    profileR,
    phaseL,
    phaseR: W - M.right,
  };
})();

const TICK = 5;

/** Visible data range. Voltage is shared by both panels; x applies to the profile panel. */
export interface View {
  vMin: number;
  vMax: number;
  xMin: number;
  xMax: number;
}

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

export function ticks(lo: number, hi: number, target: number): number[] {
  const span = hi - lo;
  if (
    !Number.isFinite(lo) ||
    !Number.isFinite(hi) ||
    !Number.isFinite(span) ||
    span <= 0 ||
    !Number.isFinite(target) ||
    target < 1
  )
    return [];
  const step = niceStep(span, Math.min(Math.floor(target), 100));
  if (!Number.isFinite(step) || step <= 0) return [];
  const first = Math.ceil(lo / step - 1e-9) * step;
  const out: number[] = [];
  // Count from zero: adding a small step to a large offset can round back to
  // the same float forever. Bound work even for pathological user ranges.
  const count = Math.min(Math.ceil(span / step) + 2, 102);
  for (let i = 0; i < count; i++) {
    const v = Number((first + i * step).toFixed(10));
    if (
      Number.isFinite(v) &&
      v >= lo - step * 1e-7 &&
      v <= hi + step * 1e-7 &&
      (!out.length || v > out[out.length - 1])
    )
      out.push(v);
  }
  return out;
}

/** Upper voltage shown on the axis by default. */
export function voltageTop(profile: Profile): number {
  const vs = profile.plateaus.map((p) => p.voltage);
  const hi = Math.max(1, ...vs);
  return Math.ceil(hi + 0.5);
}

export function defaultView(profile: Profile): View {
  const xs = profile.regions.map((r) => r.x);
  const lo = Math.min(0, ...xs);
  const hi = Math.max(0, ...xs);
  const pad = Math.max(0.5, (hi - lo) * 0.06);
  return { vMin: 0, vMax: voltageTop(profile), xMin: lo - pad, xMax: hi + pad };
}

/** Data ↔ SVG coordinate mapping for a view. */
export function scales(view: View) {
  const L = LAYOUT;
  const span = view.vMax - view.vMin;
  return {
    X: (x: number) =>
      L.profileL + ((x - view.xMin) / (view.xMax - view.xMin)) * (L.profileR - L.profileL),
    // Clamp far-off values (e.g. the open-ended top region) so the SVG stays finite; clipping hides them.
    Y: (v: number) => {
      const c = Math.min(Math.max(v, view.vMin - span), view.vMax + span);
      return L.top + (1 - (c - view.vMin) / span) * (L.bottom - L.top);
    },
    xAt: (px: number) =>
      view.xMin + ((px - L.profileL) / (L.profileR - L.profileL)) * (view.xMax - view.xMin),
    vAt: (py: number) => view.vMin + (1 - (py - L.top) / (L.bottom - L.top)) * span,
  };
}

export interface RenderOptions {
  /** Prefix for element ids (clip paths) so several figures can share a document. */
  idPrefix?: string;
  /** Region index to highlight in both panels. */
  highlight?: number | null;
  /** Phase cell (within the highlighted region) to emphasise. */
  highlightPhase?: number | null;
  /** Native SVG <title> tooltips; the interactive chart draws its own. Default true. */
  titles?: boolean;
}

/** SVG of the voltage profile (left) and the voltage-resolved phase equilibria (right). */
export function renderProfileSvg(
  profile: Profile,
  view: View = defaultView(profile),
  opts: RenderOptions = {},
): string {
  const { regions, plateaus, window } = profile;
  const L = LAYOUT;
  const { X, Y } = scales(view);
  const id = opts.idPrefix ?? "rvc";
  const plotH = L.bottom - L.top;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" class="profile-svg" role="img" aria-label="${esc(
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
    .profile-svg .hl { fill: none; stroke: var(--accent, #1f5fbf); stroke-width: 2.5; }
    .profile-svg .hl-seg { stroke: var(--accent, #1f5fbf); stroke-opacity: 0.35; stroke-width: 9; stroke-linecap: round; }
  </style>`);
  parts.push(`<defs>
    <clipPath id="${id}-clip-profile"><rect x="${L.profileL}" y="${L.top}" width="${L.profileR - L.profileL}" height="${plotH}"/></clipPath>
    <clipPath id="${id}-clip-phase"><rect x="${L.phaseL}" y="${L.top}" width="${L.phaseR - L.phaseL}" height="${plotH}"/></clipPath>
    <clipPath id="${id}-clip-all"><rect x="${L.profileL}" y="${L.top}" width="${L.phaseR - L.profileL}" height="${plotH}"/></clipPath>
  </defs>`);

  const vTicks = ticks(view.vMin, view.vMax, 6);
  const xTicks = ticks(view.xMin, view.xMax, 7);

  // Grid (behind everything).
  for (const v of vTicks)
    parts.push(
      `<line class="grid" x1="${L.profileL}" x2="${L.profileR}" y1="${Y(v)}" y2="${Y(v)}"/>`,
    );

  if (profile.stabilized) {
    const source =
      profile.eAboveHull === null
        ? "仮想相"
        : `元の E_hull: ${formatNumber(profile.eAboveHull * 1000, 1)} meV/atom`;
    parts.push(`<text class="muted" x="60" y="13">対象相を hull 補正 (${source})</text>`);
  }

  // Stability window band across both panels.
  if (window?.targetIsPhase && window.high > window.low + 1e-9) {
    const y1 = Y(window.high);
    const y0 = Y(window.low);
    parts.push(
      `<rect class="window" clip-path="url(#${id}-clip-all)" x="${L.profileL}" y="${y1}" width="${L.phaseR - L.profileL}" height="${y0 - y1}"/>`,
    );
  }

  // Step profile: vertical segments are regions, horizontal ones plateaus.
  parts.push(`<g clip-path="url(#${id}-clip-profile)">`);
  const cls = (x0: number, x1: number) =>
    x1 <= 1e-9 && x0 < -1e-9 ? "ox" : x0 >= -1e-9 && x1 > 1e-9 ? "red" : "neutral";
  const seg = (x0: number, y0: number, x1: number, y1: number, c: string) =>
    parts.push(
      `<line class="${c}" stroke-width="2.5" stroke-linecap="square" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}"/>`,
    );
  regions.forEach((r) => {
    const c = Math.abs(r.x) < 1e-9 ? "neutral" : r.x < 0 ? "ox" : "red";
    seg(r.x, r.vMax, r.x, r.vMin, c);
  });
  plateaus.forEach((p) => {
    if (p.xStart < -1e-9 && p.xEnd > 1e-9) {
      seg(p.xStart, p.voltage, 0, p.voltage, "ox");
      seg(0, p.voltage, p.xEnd, p.voltage, "red");
    } else {
      seg(p.xStart, p.voltage, p.xEnd, p.voltage, cls(p.xStart, p.xEnd));
    }
  });
  parts.push(
    `<line class="grid" stroke-dasharray="3 3" x1="${X(0)}" x2="${X(0)}" y1="${L.top}" y2="${L.bottom}"/>`,
  );
  parts.push(`<text x="${X(0) + 4}" y="${L.top + 16}">${formulaTspans(profile.formula)}</text>`);
  parts.push(`</g>`);
  const xs = regions.map((r) => r.x);
  if (xs.some((x) => x < -1e-9))
    parts.push(`<text class="muted" x="${L.profileL + 8}" y="${L.bottom - 9}">← Oxidation</text>`);
  if (xs.some((x) => x > 1e-9))
    parts.push(
      `<text class="muted" x="${L.profileR - 8}" y="${L.bottom - 9}" text-anchor="end">Reduction →</text>`,
    );

  // Phase equilibria: each voltage band is split into one cell per phase, with widths (and
  // therefore areas within the band) proportional to the atomic fraction of that phase.
  parts.push(`<g clip-path="url(#${id}-clip-phase)">`);
  regions.forEach((r) => {
    const yTop = Y(r.vMax);
    const yBot = Y(r.vMin);
    const h = yBot - yTop;
    if (h <= 0 || yBot < L.top || yTop > L.bottom) return;
    const side =
      Math.abs(r.x) < 1e-9 ? (window?.targetIsPhase ? "target" : "") : r.x < 0 ? "ox" : "red";
    const range = `${formatNumber(r.vMin, 3)}–${r.vMax === Infinity ? "∞" : formatNumber(r.vMax, 3)} V`;
    // Center labels in the visible part of the band.
    const visTop = Math.max(yTop, L.top);
    const visH = Math.min(yBot, L.bottom) - visTop;
    const fractions = atomicFractions(r);
    let x0 = L.phaseL;
    r.phases.forEach((ph, i) => {
      const w = (L.phaseR - L.phaseL) * fractions[i];
      const pct = formatNumber(fractions[i] * 100, 1);
      parts.push(
        opts.titles === false
          ? `<g class="cell">`
          : `<g class="cell"><title>${esc(`${ph.entry.name}: ${pct} at.% (${formatNumber(ph.amount)} per ${profile.formula}), ${range}`)}</title>`,
      );
      parts.push(`<rect class="box ${side}" x="${x0}" y="${yTop}" width="${w}" height="${h}"/>`);
      // Label only when it fits; narrow cells rely on the tooltip.
      if (visH >= 13 && w >= labelWidth(ph.entry.name) + 4) {
        parts.push(
          `<text class="cell-label" x="${x0 + w / 2}" y="${visTop + visH / 2 + 4}" text-anchor="middle">${formulaTspans(ph.entry.name)}</text>`,
        );
      }
      parts.push(`</g>`);
      x0 += w;
    });
  });
  parts.push(`</g>`);

  // Hover highlight, linked across both panels.
  const hr = opts.highlight == null ? undefined : regions[opts.highlight];
  if (hr) {
    parts.push(`<g clip-path="url(#${id}-clip-all)" pointer-events="none">`);
    parts.push(
      `<line class="hl-seg" clip-path="url(#${id}-clip-profile)" x1="${X(hr.x)}" x2="${X(hr.x)}" y1="${Y(hr.vMax)}" y2="${Y(hr.vMin)}"/>`,
    );
    const yTop = Y(hr.vMax);
    parts.push(
      `<rect class="hl" x="${L.phaseL}" y="${yTop}" width="${L.phaseR - L.phaseL}" height="${Y(hr.vMin) - yTop}"/>`,
    );
    if (opts.highlightPhase != null && hr.phases[opts.highlightPhase]) {
      const fr = atomicFractions(hr);
      const x0 =
        L.phaseL +
        (L.phaseR - L.phaseL) * fr.slice(0, opts.highlightPhase).reduce((a, b) => a + b, 0);
      parts.push(
        `<rect class="hl" x="${x0}" y="${yTop}" width="${(L.phaseR - L.phaseL) * fr[opts.highlightPhase]}" height="${Y(hr.vMin) - yTop}"/>`,
      );
    }
    parts.push(`</g>`);
  }

  // Frames with inward ticks mirrored on all four sides.
  for (const [x0, x1] of [
    [L.profileL, L.profileR],
    [L.phaseL, L.phaseR],
  ])
    parts.push(`<rect class="axis" x="${x0}" y="${L.top}" width="${x1 - x0}" height="${plotH}"/>`);
  for (const v of vTicks) {
    const y = Y(v);
    for (const [x, dir] of [
      [L.profileL, 1],
      [L.profileR, -1],
      [L.phaseL, 1],
      [L.phaseR, -1],
    ] as const)
      parts.push(`<line class="axis" x1="${x}" x2="${x + dir * TICK}" y1="${y}" y2="${y}"/>`);
    parts.push(
      `<text x="${L.profileL - 6}" y="${y + 4}" text-anchor="end">${formatNumber(v)}</text>`,
    );
  }
  for (const x of xTicks) {
    const px = X(x);
    parts.push(
      `<line class="axis" x1="${px}" x2="${px}" y1="${L.bottom}" y2="${L.bottom - TICK}"/>`,
    );
    parts.push(`<line class="axis" x1="${px}" x2="${px}" y1="${L.top}" y2="${L.top + TICK}"/>`);
    parts.push(
      `<text x="${px}" y="${L.bottom + 18}" text-anchor="middle">${formatNumber(x)}</text>`,
    );
  }

  // Axis titles.
  const midY = (L.top + L.bottom) / 2;
  parts.push(
    `<text x="16" y="${midY}" text-anchor="middle" transform="rotate(-90 16 ${midY})">Voltage (V) vs ${esc(
      profile.ion,
    )}/${esc(profile.ion)}${profile.charge > 1 ? profile.charge : ""}+</text>`,
  );
  parts.push(
    `<text x="${(L.profileL + L.profileR) / 2}" y="${L.H - 12}" text-anchor="middle">${esc(profile.ion)} uptake per ${formulaTspans(
      profile.formula,
    )}</text>`,
  );
  parts.push(
    `<text x="${(L.phaseL + L.phaseR) / 2}" y="${L.H - 12}" text-anchor="middle">Phase equilibria</text>`,
  );
  parts.push(`</svg>`);
  return parts.join("\n");
}
