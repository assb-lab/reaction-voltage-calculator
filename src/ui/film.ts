import type { FilmResult } from "../core/film";
import { formatNumber } from "../core/formula";
import { t } from "../i18n";
import { escapeHtml, formulaHtml } from "./html";

type Film = Extract<FilmResult, { kind: "film" }>;

/** Length given in nm: nm below 1 µm, µm above, three significant digits. */
export function formatLengthNm(nm: number): string {
  if (nm < 1000) return `${Number(nm.toPrecision(3))} nm`;
  return `${Number((nm / 1000).toPrecision(3))} µm`;
}

/** Signed percentage of a relative change: 0.174 -> "+17.4 %", -0.287 -> "−28.7 %". */
export function formatChange(rel: number): string {
  const pct = Math.abs(rel) < 5e-4 ? 0 : rel * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  return `${sign}${formatNumber(Math.abs(pct), 1)} %`;
}

/** Diameters in µm with three decimals (sizes differ by small fractions). */
const um = (d: number) => d.toFixed(3);

function volList(film: Film): string {
  return film.phases
    .map((p) => `${formulaHtml(p.entry.name)} ${formatNumber(p.volFraction * 100, 1)}`)
    .join(" / ");
}

/** Headline: the film thickness, or the size change when the whole particle has decomposed. */
export function filmHeadline(film: Film): string {
  const d0 = film.outerDiameterUm / (1 + film.diameterChange);
  return film.fullyDecomposed
    ? t("film.full", {
        d0: um(d0),
        d1: um(film.outerDiameterUm),
        pct: formatChange(film.diameterChange),
      })
    : formatLengthNm(film.thicknessNm);
}

/** Volume and size change (HTML). */
export function filmChangeHtml(film: Film): string {
  const diameter = film.fullyDecomposed
    ? ""
    : `${t("film.diameter", { d: um(film.outerDiameterUm), pct: formatChange(film.diameterChange) })}<br>`;
  return `${diameter}${t("film.volumeChange", {
    v: formatChange(film.volumeChange),
    p: formatChange(film.particleVolumeChange),
  })}`;
}

/** Table cell for one region (HTML). */
export function filmCellHtml(film: FilmResult): string {
  if (film.kind === "none") return `<span class="muted">${t("film.none")}</span>`;
  if (film.kind === "unavailable")
    return `<span class="muted">${escapeHtml(t("film.unavailable", { phases: film.missing.join(", ") }))}</span>`;
  const q =
    film.capacityMAhG === null
      ? ""
      : `<br>${t("film.capacity", { q: formatNumber(film.capacityMAhG, 1) })}`;
  return `<strong>${filmHeadline(film)}</strong><br>${filmChangeHtml(film)}<br><span class="muted">vol%: ${volList(film)}</span>${q}`;
}

/** Tooltip line for one region (HTML). */
export function filmTooltipHtml(film: FilmResult): string {
  if (film.kind === "none") return "";
  if (film.kind === "unavailable")
    return `<div>${escapeHtml(t("film.unavailable", { phases: film.missing.join(", ") }))}</div>`;
  const head = film.fullyDecomposed
    ? filmHeadline(film)
    : t("film.tooltip", { t: formatLengthNm(film.thicknessNm) });
  return `<div>${head} <span class="muted">(${t("film.volumeChange", {
    v: formatChange(film.volumeChange),
    p: formatChange(film.particleVolumeChange),
  })})</span></div>`;
}
