import { mpUrl } from "../core/mpid";
import { t } from "../i18n";

/** Escape external text before using it in HTML text or quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function formulaHtml(name: string): string {
  return escapeHtml(name).replace(/([A-Za-z)\]])(\d+(?:\.\d+)?)/g, "$1<sub>$2</sub>");
}

/**
 * Phase name (formula) linking to its Materials Project page in a new tab; a plain span with the
 * id as tooltip for non-MP entries (demo, user data).
 */
export function phaseLinkHtml(entry: { id: string; name: string }): string {
  const url = mpUrl(entry.id);
  const id = escapeHtml(entry.id);
  return url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(t("link.openMp", { id: entry.id }))}">${formulaHtml(entry.name)}</a>`
    : `<span title="${id}">${formulaHtml(entry.name)}</span>`;
}

/** Material id, linked to Materials Project when it is an MP id. */
export function idLinkHtml(id: string): string {
  const url = mpUrl(id);
  return url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)}</a>`
    : escapeHtml(id);
}
