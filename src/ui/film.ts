import type { FilmResult } from "../core/film";
import { formatNumber } from "../core/formula";
import { t } from "../i18n";
import { escapeHtml, formulaHtml } from "./html";

/** Length given in nm: nm below 1 µm, µm above, three significant digits. */
export function formatLengthNm(nm: number): string {
  if (nm < 1000) return `${Number(nm.toPrecision(3))} nm`;
  return `${Number((nm / 1000).toPrecision(3))} µm`;
}

function volList(film: Extract<FilmResult, { kind: "film" }>): string {
  return film.phases
    .map((p) => `${formulaHtml(p.entry.name)} ${formatNumber(p.volFraction * 100, 1)}`)
    .join(" / ");
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
  return `<strong>${formatLengthNm(film.thicknessNm)}</strong><br><span class="muted">vol%: ${volList(film)}</span>${q}`;
}

/** Tooltip line for one region (HTML). */
export function filmTooltipHtml(film: FilmResult): string {
  if (film.kind === "none") return "";
  if (film.kind === "unavailable")
    return `<div>${escapeHtml(t("film.unavailable", { phases: film.missing.join(", ") }))}</div>`;
  return `<div>${t("film.tooltip", { t: formatLengthNm(film.thicknessNm) })} <span class="muted">(vol%: ${volList(film)})</span></div>`;
}
