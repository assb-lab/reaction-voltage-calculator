import { prepareEntries, type Entry } from "../core/entries";
import { hullEnergy } from "../core/profile";
import { t } from "../i18n";
import { normalizeMpId } from "../core/mpid";

export const MP_API_BASE = "https://api.materialsproject.org";
/** Same-origin path proxied to MP_API_BASE by `vp dev` / `vp preview` (see vite.config.ts). */
export const MP_DEV_PROXY = "/mp-api";

export const THERMO_TYPES = ["GGA_GGA+U_R2SCAN", "GGA_GGA+U", "R2SCAN"] as const;
export type ThermoType = (typeof THERMO_TYPES)[number];

const FIELDS = [
  "material_id",
  "formula_pretty",
  "composition",
  "energy_per_atom",
  "formation_energy_per_atom",
  "energy_above_hull",
  "thermo_type",
  "volume",
  "nsites",
  "deprecated",
];
export const PER_PAGE = 1000;

export interface ThermoDoc {
  material_id: string;
  formula_pretty: string;
  composition: Record<string, number>;
  energy_per_atom: number;
  formation_energy_per_atom?: number | null;
  energy_above_hull?: number | null;
  thermo_type: string;
  volume?: number | null;
  nsites?: number | null;
  deprecated?: boolean;
}

/** All sub-systems of a chemical system, e.g. Li-S -> ["Li", "S", "Li-S"]. */
export function subChemsys(elements: string[]): string[] {
  const els = [...new Set(elements)].sort();
  const out: string[] = [];
  for (let mask = 1; mask < 1 << els.length; mask++) {
    out.push(els.filter((_, i) => mask & (1 << i)).join("-"));
  }
  return out;
}

/**
 * Which MP energy the entries carry.
 * - "formation": MP formation energies (elemental references at 0), with unstable entries placed at
 *   MP's `energy_above_hull` (see alignToMpHull) so that the hull matches Materials Project.
 * - "total": `energy_per_atom`. In the GGA_GGA+U_R2SCAN mixing scheme these are NOT on one
 *   energy scale (e.g. r2SCAN S/Li unshifted vs. shifted r2SCAN Li2S), so hulls built from them are wrong.
 */
export type EnergyBasis = "formation" | "total";

function hasFormation(doc: ThermoDoc): boolean {
  return (
    typeof doc.formation_energy_per_atom === "number" &&
    Number.isFinite(doc.formation_energy_per_atom)
  );
}

export function docToEntry(
  doc: ThermoDoc,
  basis: EnergyBasis = hasFormation(doc) ? "formation" : "total",
): Entry {
  const atoms = Object.values(doc.composition).reduce((a, b) => a + b, 0);
  return {
    id: normalizeMpId(String(doc.material_id)),
    name: doc.formula_pretty,
    composition: doc.composition,
    energyPerAtom: basis === "formation" ? doc.formation_energy_per_atom! : doc.energy_per_atom,
    thermoType: doc.thermo_type,
    eAboveHull: doc.energy_above_hull ?? undefined,
    volumePerAtom: doc.volume && atoms ? doc.volume / atoms : undefined,
  };
}

/**
 * Convert non-deprecated thermo docs to entries on one energy basis: formation energies when every
 * doc has one (always the case for current MP data), otherwise total energies.
 */
export function docsToEntries(docs: ThermoDoc[]): { entries: Entry[]; energyBasis: EnergyBasis } {
  const live = docs.filter((d) => !d.deprecated);
  const energyBasis: EnergyBasis = live.length && live.every(hasFormation) ? "formation" : "total";
  const entries = live.map((d) => docToEntry(d, energyBasis));
  return { entries: energyBasis === "formation" ? alignToMpHull(entries) : entries, energyBasis };
}

/**
 * Place unstable entries at MP's reported distance above the hull of the stable entries.
 *
 * In the mixing scheme, `formation_energy_per_atom` of some GGA-only entries disagrees with their own
 * `energy_above_hull` (e.g. Li7P3S11: Ef lies 14 meV/atom below the Li3PS4–P2S5 tie line while MP
 * reports E_hull = 20 meV/atom). The stable entries (E_hull = 0) are mutually consistent, so
 * E_f = hull_stable(composition) + E_hull reproduces MP's phase diagram exactly.
 */
export function alignToMpHull(entries: Entry[]): Entry[] {
  const stable = entries.filter((e) => e.eAboveHull !== undefined && e.eAboveHull <= 1e-9);
  const elements = [...new Set(entries.flatMap((e) => Object.keys(e.composition)))].sort();
  let prepared;
  try {
    prepared = prepareEntries(stable, elements);
  } catch {
    return entries; // incomplete data (no stable elemental entry): keep MP formation energies
  }
  return entries.map((e) => {
    if (e.eAboveHull === undefined || e.eAboveHull <= 1e-9) return e;
    const hull = hullEnergy(prepared.entries, prepared.elements, e.composition);
    return { ...e, energyPerAtom: hull + e.eAboveHull };
  });
}

/** Thermo endpoint URL for one page of the chemical system and all its sub-systems. */
export function thermoUrl(
  elements: string[],
  thermoType: ThermoType,
  page = 1,
  base: string = MP_API_BASE,
): string {
  const params = new URLSearchParams({
    chemsys: subChemsys(elements).join(","),
    thermo_types: thermoType,
    _fields: FIELDS.join(","),
    _per_page: String(PER_PAGE),
    _page: String(page),
  });
  return `${base}/materials/thermo/?${params}`;
}

export type Shell = "bash" | "powershell";

/**
 * Terminal command that downloads page `page` of the thermo data with the key
 * taken from the MP_API_KEY environment variable (the key never appears in the command).
 */
export function curlCommand(
  elements: string[],
  thermoType: ThermoType,
  shell: Shell,
  page = 1,
): string {
  const url = thermoUrl(elements, thermoType, page);
  const file = `mp_${[...elements].sort().join("-")}_${thermoType}_p${page}.json`;
  return shell === "powershell"
    ? `curl.exe -fsS -H "X-API-KEY: $env:MP_API_KEY" -o ${file} "${url}"`
    : `curl -fsS -H "X-API-KEY: $MP_API_KEY" -o ${file} "${url}"`;
}

/** The browser refused the request (CORS / network), as opposed to an HTTP error from MP. */
export class MpNetworkError extends Error {}

export class MpHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface FetchOptions {
  apiKey: string;
  /** API base URL; MP_DEV_PROXY when served by the local Vite server. */
  baseUrl?: string;
  elements: string[];
  thermoType: ThermoType;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
}

/** Fetch every (non-deprecated) thermo entry of the chemical system and its sub-systems. */
export async function fetchThermoEntries(
  opts: FetchOptions,
): Promise<{ entries: Entry[]; energyBasis: EnergyBasis }> {
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  if (!opts.apiKey.trim()) throw new Error(t("mp.noKey"));
  const docs: ThermoDoc[] = [];
  for (let page = 1; ; page++) {
    let res: Response;
    try {
      res = await fetchFn(thermoUrl(opts.elements, opts.thermoType, page, opts.baseUrl), {
        headers: { "X-API-KEY": opts.apiKey.trim(), Accept: "application/json" },
        signal: opts.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      // MP only sends CORS headers to materialsproject.org, so browsers block other origins.
      throw new MpNetworkError(t("mp.network"));
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? t("mp.httpKeyHint") : "";
      throw new MpHttpError(t("mp.http", { status: res.status, hint }), res.status);
    }
    const body = (await res.json()) as {
      data?: ThermoDoc[];
      meta?: { total_doc?: number };
      errors?: unknown[];
    };
    if (!Array.isArray(body.data) || body.errors?.length) throw new Error(t("mp.incomplete"));
    const data = body.data ?? [];
    docs.push(...data);
    const total = body.meta?.total_doc ?? null;
    opts.onProgress?.(docs.length, total);
    if (data.length < PER_PAGE || (total !== null && docs.length >= total)) break;
  }
  return docsToEntries(docs.filter((d) => d.thermo_type === opts.thermoType));
}
