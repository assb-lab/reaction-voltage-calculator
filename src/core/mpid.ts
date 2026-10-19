/**
 * Materials Project identifiers.
 *
 * The MP API (emmet-core) now returns ids as AlphaID: the integer written in base 26 with the letters
 * a–z (a = 0), left-padded with "a", e.g. "mp-aaaceqmj" = mp-995393 and "mp-aaaaaabz" = mp-51.
 * emmet's `AlphaID(...).string` keeps the legacy "mp-<integer>" form up to its cut point, which is
 * also what the MP website uses, so ids are normalized to that form for display, links and matching.
 */
const ALPHA_ID = /^(mp|mvc)-([a-z]+)$/;
/** emmet-core AlphaID._cut_point: ids up to this value keep the legacy integer form. */
export const ALPHA_ID_CUT_POINT = 3347529;

/** Integer value of an AlphaID body ("aaaceqmj" -> 995393). */
export function alphaToInt(alpha: string): number {
  let n = 0;
  for (const ch of alpha) n = n * 26 + (ch.charCodeAt(0) - 97);
  return n;
}

/**
 * "mp-aaaceqmj" -> "mp-995393", as emmet's `AlphaID(...).string`. Ids beyond the cut point keep the
 * (padded) AlphaID form; legacy and non-MP ids are returned unchanged.
 */
export function normalizeMpId(id: string): string {
  const m = ALPHA_ID.exec(id.trim().toLowerCase());
  if (!m) return id;
  const n = alphaToInt(m[2]);
  return n <= ALPHA_ID_CUT_POINT ? `${m[1]}-${n}` : `${m[1]}-${m[2]}`;
}

/** Materials Project page of a material id, or null for non-MP ids (demo, user entries…). */
export function mpUrl(id: string): string | null {
  const norm = normalizeMpId(id);
  return /^(mp|mvc)-[a-z0-9]+$/.test(norm)
    ? `https://materialsproject.org/materials/${encodeURIComponent(norm)}`
    : null;
}
