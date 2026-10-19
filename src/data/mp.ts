import type { Entry } from "../core/entries";

export const MP_API_BASE = "https://api.materialsproject.org";

export const THERMO_TYPES = ["GGA_GGA+U_R2SCAN", "GGA_GGA+U", "R2SCAN"] as const;
export type ThermoType = (typeof THERMO_TYPES)[number];

const FIELDS = [
  "material_id",
  "formula_pretty",
  "composition",
  "energy_per_atom",
  "energy_above_hull",
  "thermo_type",
  "volume",
  "nsites",
  "deprecated",
];
const PER_PAGE = 1000;

export interface ThermoDoc {
  material_id: string;
  formula_pretty: string;
  composition: Record<string, number>;
  energy_per_atom: number;
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

export function docToEntry(doc: ThermoDoc): Entry {
  const atoms = Object.values(doc.composition).reduce((a, b) => a + b, 0);
  return {
    id: String(doc.material_id),
    name: doc.formula_pretty,
    composition: doc.composition,
    energyPerAtom: doc.energy_per_atom,
    thermoType: doc.thermo_type,
    eAboveHull: doc.energy_above_hull ?? undefined,
    volumePerAtom: doc.volume && atoms ? doc.volume / atoms : undefined,
  };
}

export interface FetchOptions {
  apiKey: string;
  elements: string[];
  thermoType: ThermoType;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
}

/** Fetch every (non-deprecated) thermo entry of the chemical system and its sub-systems. */
export async function fetchThermoEntries(opts: FetchOptions): Promise<Entry[]> {
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  if (!opts.apiKey.trim()) throw new Error("Materials Project API key を入力してください");
  const docs: ThermoDoc[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      chemsys: subChemsys(opts.elements).join(","),
      thermo_types: opts.thermoType,
      _fields: FIELDS.join(","),
      _per_page: String(PER_PAGE),
      _page: String(page),
    });
    const res = await fetchFn(`${MP_API_BASE}/materials/thermo/?${params}`, {
      headers: { "X-API-KEY": opts.apiKey.trim(), Accept: "application/json" },
      signal: opts.signal,
    });
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " (API key を確認してください)" : "";
      throw new Error(`Materials Project API エラー: HTTP ${res.status}${hint}`);
    }
    const body = (await res.json()) as {
      data?: ThermoDoc[];
      meta?: { total_doc?: number };
      errors?: unknown[];
    };
    if (!Array.isArray(body.data) || body.errors?.length)
      throw new Error("Materials Project API の応答が不完全です。再取得してください");
    const data = body.data ?? [];
    docs.push(...data);
    const total = body.meta?.total_doc ?? null;
    opts.onProgress?.(docs.length, total);
    if (data.length < PER_PAGE || (total !== null && docs.length >= total)) break;
  }
  return docs.filter((d) => !d.deprecated && d.thermo_type === opts.thermoType).map(docToEntry);
}
