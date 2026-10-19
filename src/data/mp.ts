import type { Entry } from "../core/entries";

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
export async function fetchThermoEntries(opts: FetchOptions): Promise<Entry[]> {
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  if (!opts.apiKey.trim()) throw new Error("Materials Project API key を入力してください");
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
      throw new MpNetworkError(
        "ブラウザから Materials Project API に接続できませんでした。MP API は materialsproject.org 以外からのブラウザ通信 (CORS) を許可していません。下の「コマンドで取得」で JSON を取得して読み込んでください。",
      );
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " (API key を確認してください)" : "";
      throw new MpHttpError(`Materials Project API エラー: HTTP ${res.status}${hint}`, res.status);
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
