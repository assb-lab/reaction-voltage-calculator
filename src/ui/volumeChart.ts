import type { FilmResult } from "../core/film";
import type { Profile } from "../core/profile";
import { escapeHtml } from "./html";
import { formatChange } from "./film";
import { ticks, voltageTop } from "./plot";

const W = 560;
const H = 250;
const M = { left: 60, right: 16, top: 14, bottom: 44 };

/** Film result of each region, in region order. */
export type RegionFilms = { region: number; film: FilmResult }[];

/**
 * Step chart of the volume change of the decomposed part (V_products / V_target − 1) against the
 * voltage, one level per voltage region. Each level carries `data-region` so a click can select it.
 */
export function renderVolumeChartSvg(
  profile: Profile,
  films: RegionFilms,
  selected: number | null,
  ariaLabel: string,
): string {
  const vTop = voltageTop(profile);
  const levels = films.flatMap(({ region, film }) => {
    const r = profile.regions[region];
    const lo = Math.max(0, r.vMin);
    const hi = Math.min(vTop, r.vMax);
    if (hi <= lo) return [];
    if (film.kind === "none") return [{ region, lo, hi, dv: 0, side: "neutral" }];
    if (film.kind !== "film") return [];
    return [{ region, lo, hi, dv: film.volumeChange * 100, side: r.x < 0 ? "ox" : "red" }];
  });

  const dvs = [0, ...levels.map((l) => l.dv)];
  let yMin = Math.min(...dvs);
  let yMax = Math.max(...dvs);
  const pad = Math.max(5, (yMax - yMin) * 0.1);
  yMin -= yMin < 0 ? pad : 0;
  yMax += pad;
  const X = (v: number) => M.left + (v / vTop) * (W - M.left - M.right);
  const Y = (dv: number) => M.top + ((yMax - dv) / (yMax - yMin)) * (H - M.top - M.bottom);
  const bottom = H - M.bottom;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="volume-svg" role="img" aria-label="${escapeHtml(ariaLabel)}">`,
  ];
  for (const v of ticks(0, vTop, 8)) {
    parts.push(
      `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${M.top}" y2="${bottom}"/>`,
      `<text x="${X(v)}" y="${bottom + 16}" text-anchor="middle">${v}</text>`,
    );
  }
  for (const dv of ticks(yMin, yMax, 6)) {
    parts.push(
      `<line class="grid${dv === 0 ? " zero" : ""}" x1="${M.left}" x2="${W - M.right}" y1="${Y(dv)}" y2="${Y(dv)}"/>`,
      `<text x="${M.left - 6}" y="${Y(dv) + 4}" text-anchor="end">${dv > 0 ? "+" : ""}${dv}</text>`,
    );
  }
  // Steps: thin connectors between neighbouring levels, then the levels themselves.
  const sorted = [...levels].sort((a, b) => a.lo - b.lo);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (Math.abs(a.hi - b.lo) < 1e-9)
      parts.push(
        `<line class="connector" x1="${X(b.lo)}" x2="${X(b.lo)}" y1="${Y(a.dv)}" y2="${Y(b.dv)}"/>`,
      );
  }
  for (const l of levels) {
    const sel = l.region === selected ? " selected" : "";
    const label = `${l.lo.toFixed(3)} – ${profile.regions[l.region].vMax === Infinity ? "∞" : l.hi.toFixed(3)} V: ${formatChange(l.dv / 100)}`;
    parts.push(
      `<g class="level" data-region="${l.region}"><title>${escapeHtml(label)}</title>`,
      `<line class="hit" x1="${X(l.lo)}" x2="${X(l.hi)}" y1="${Y(l.dv)}" y2="${Y(l.dv)}"/>`,
      `<line class="${l.side}${sel}" x1="${X(l.lo)}" x2="${X(l.hi)}" y1="${Y(l.dv)}" y2="${Y(l.dv)}"/></g>`,
    );
  }
  parts.push(
    `<rect class="axis" x="${M.left}" y="${M.top}" width="${W - M.left - M.right}" height="${bottom - M.top}"/>`,
    `<text x="${(M.left + W - M.right) / 2}" y="${H - 6}" text-anchor="middle">Voltage (V) vs ${escapeHtml(profile.ion)}/${escapeHtml(profile.ion)}${profile.charge > 1 ? profile.charge : ""}+</text>`,
    `<text transform="translate(14 ${(M.top + bottom) / 2}) rotate(-90)" text-anchor="middle">ΔV of decomposed part (%)</text>`,
    `</svg>`,
  );
  return parts.join("");
}
