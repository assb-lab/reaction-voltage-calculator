import type { VolumeResult } from "../core/volume";
import { formatNumber } from "../core/formula";
import { t } from "../i18n";
import { formatChange } from "./film";
import { escapeHtml, formulaHtml } from "./html";

/** Initial-target-referenced volume expansion, distinct from a local reaction-step change. */
export function volumeCellHtml(volume: VolumeResult): string {
  if (volume.kind === "none") return `<strong>${formatChange(0)}</strong>`;
  if (volume.kind === "unavailable")
    return `<span class="muted">${escapeHtml(t("film.unavailable", { phases: volume.missing.join(", ") }))}</span>`;
  const gas = volume.gases.length
    ? `<br>${t("volume.gases", { list: volume.gases.map((g) => `${formulaHtml(g.entry.name)} (${formatNumber(g.amount)} mol/mol)`).join(", ") })}`
    : "";
  return `<strong>${formatChange(volume.volumeChange)}</strong><br><span class="muted">${t("volume.values", { initial: formatNumber(volume.targetVolume, 3), products: formatNumber(volume.productVolume, 3) })}</span>${gas}`;
}
