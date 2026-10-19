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
