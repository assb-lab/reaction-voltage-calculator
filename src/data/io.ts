import type { Entry } from "../core/entries";
import { formatFormula, numAtoms, reduceComposition, type Composition } from "../core/formula";
import { alignToMpHull, docsToEntries, PER_PAGE, type EnergyBasis, type ThermoDoc } from "./mp";

export interface EntrySet {
  version: 1;
  source: string;
  thermoType?: string;
  elements: string[];
  fetchedAt?: string;
  /** For Materials Project data: which MP energy `energyPerAtom` holds (see EnergyBasis). */
  energyBasis?: EnergyBasis;
  entries: Entry[];
}

const STALE_MP_ENERGY =
  "Materials Project の energy_per_atom を使ったデータです。mixed scheme (GGA_GGA+U_R2SCAN) では値のスケールが揃っておらず、相図が正しくなりません。最新のコマンドまたは「MP から取得」で再取得してください。";

export function serializeEntrySet(set: EntrySet): string {
  return JSON.stringify(set, null, 1);
}

interface PymatgenEntryDict {
  "@class"?: string;
  entry_id?: string | null;
  composition: Record<string, number>;
  energy: number;
  correction?: number;
  energy_adjustments?: { value?: number }[];
  data?: { thermo_type?: string; material_id?: string };
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fromPymatgen(d: PymatgenEntryDict, i: number): Entry {
  d = { ...d, composition: validateComposition(d.composition, i) };
  const atoms = numAtoms(d.composition);
  // as_dict() includes the total correction. Composition/temperature adjustment
  // dictionaries store constructor arguments, not a computed "value" property.
  let adjust = d.correction ?? 0;
  if (d.correction == null && d.energy_adjustments) {
    if (
      !Array.isArray(d.energy_adjustments) ||
      d.energy_adjustments.some((a) => !a || !isNumber(a.value))
    )
      throw new Error(`entries[${i}]: energy_adjustments に対応する correction が必要です`);
    adjust = d.energy_adjustments.reduce((s, a) => s + a.value!, 0);
  }
  if (!isNumber(adjust)) throw new Error(`entries[${i}].correction が数値ではありません`);
  return {
    id: d.entry_id ?? d.data?.material_id ?? `entry-${i}`,
    name: formatFormula(reduceComposition(d.composition).reduced),
    composition: d.composition,
    energyPerAtom: (d.energy + adjust) / atoms,
    thermoType: d.data?.thermo_type,
  };
}

function validateComposition(comp: unknown, i: number): Composition {
  if (!comp || typeof comp !== "object" || Array.isArray(comp))
    throw new Error(`entries[${i}].composition が不正です`);
  const out: Composition = {};
  for (const [el, n] of Object.entries(comp)) {
    if (!/^[A-Z][a-z]?$/.test(el) || !isNumber(n) || n < 0)
      throw new Error(`entries[${i}].composition が不正です`);
    if (n > 0) out[el] = n;
  }
  if (!Object.keys(out).length || !Number.isFinite(numAtoms(out)))
    throw new Error(`entries[${i}].composition が不正です`);
  return out;
}

function validateEntry(e: Entry, i: number): Entry {
  if (!e || typeof e !== "object") throw new Error(`entries[${i}] がオブジェクトではありません`);
  const composition = validateComposition(e.composition, i);
  if (!isNumber(e.energyPerAtom))
    throw new Error(`entries[${i}].energyPerAtom が数値ではありません`);
  if (e.name != null && typeof e.name !== "string")
    throw new Error(`entries[${i}].name が文字列ではありません`);
  return {
    ...e,
    composition,
    id: String(e.id ?? `entry-${i}`),
    name: e.name ?? formatFormula(reduceComposition(composition).reduced),
  };
}

interface ParsedFile {
  set: EntrySet;
  /** Raw Materials Project API response: document ids in this file and the reported total. */
  mp?: { ids: string[]; total: number | null };
  warnings: string[];
}

function fromMpResponse(raw: { data: unknown[]; meta?: { total_doc?: unknown } }): ParsedFile {
  const ids: string[] = [];
  const docs = raw.data.map((item, i): ThermoDoc => {
    const doc = item as ThermoDoc;
    if (!doc || typeof doc !== "object" || !isNumber(doc.energy_per_atom))
      throw new Error(`data[${i}] は Materials Project の thermo ドキュメントではありません`);
    ids.push(`${doc.material_id}|${doc.thermo_type}`);
    return {
      ...doc,
      composition: validateComposition(doc.composition, i),
      formula_pretty:
        doc.formula_pretty ?? formatFormula(reduceComposition(doc.composition).reduced),
    };
  });
  const converted = docsToEntries(docs);
  const entries = converted.entries.map((e, i) => validateEntry(e, i));
  const energyBasis = converted.energyBasis;
  const total = isNumber(raw.meta?.total_doc) ? raw.meta.total_doc : null;
  return {
    set: {
      version: 1,
      source: "Materials Project",
      thermoType: entries.find((e) => e.thermoType)?.thermoType,
      elements: [...new Set(entries.flatMap((e) => Object.keys(e.composition)))].sort(),
      energyBasis,
      entries,
    },
    mp: { ids, total },
    warnings: energyBasis === "total" && entries.length ? [STALE_MP_ENERGY] : [],
  };
}

function parseOne(text: string): ParsedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON として読み込めません");
  }
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Array.isArray((raw as { data?: unknown }).data) &&
    !("entries" in raw)
  ) {
    return fromMpResponse(raw as { data: unknown[] });
  }
  let list: unknown[];
  let meta: Partial<EntrySet> = {};
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as EntrySet).entries)) {
    meta = raw as EntrySet;
    list = (raw as EntrySet).entries;
  } else {
    throw new Error("entries 配列が見つかりません");
  }
  const entries = list.map((item, i) => {
    const d = item as PymatgenEntryDict & Entry;
    if (d && isNumber(d.energy) && d.composition && !isNumber(d.energyPerAtom))
      return validateEntry(fromPymatgen(d, i), i);
    return validateEntry(d, i);
  });
  const elements =
    meta.elements ?? [...new Set(entries.flatMap((e) => Object.keys(e.composition)))].sort();
  const staleMp =
    !!meta.source?.startsWith("Materials Project") && meta.energyBasis !== "formation";
  return {
    set: {
      version: 1,
      source: meta.source ?? (Array.isArray(raw) ? "imported" : "file"),
      thermoType: meta.thermoType ?? entries.find((e) => e.thermoType)?.thermoType,
      elements,
      fetchedAt: meta.fetchedAt,
      energyBasis: meta.energyBasis,
      entries,
    },
    warnings: staleMp ? [STALE_MP_ENERGY] : [],
  };
}

/**
 * Parse entries from JSON: this app's EntrySet, a bare Entry[], a list of
 * pymatgen ComputedEntry / ComputedStructureEntry dicts (`entry.as_dict()`),
 * or a raw Materials Project `/materials/thermo/` response.
 */
export function parseEntrySet(text: string): EntrySet {
  return parseOne(text).set;
}

export interface FileText {
  name: string;
  text: string;
}

/**
 * Parse and merge several files (e.g. the pages of an MP API download).
 * Duplicate entries are dropped; missing MP pages are reported as warnings.
 */
export function parseEntryFiles(files: FileText[]): { set: EntrySet; warnings: string[] } {
  if (!files.length) throw new Error("ファイルが選択されていません");
  const parsed = files.map((f) => {
    try {
      return parseOne(f.text);
    } catch (e) {
      throw new Error(`${f.name}: ${(e as Error).message}`);
    }
  });
  const thermoTypes = [
    ...new Set(parsed.flatMap((p) => p.set.entries.map((e) => e.thermoType))),
  ].filter((t): t is string => !!t);
  if (thermoTypes.length > 1)
    throw new Error(`thermo type が混在しています: ${thermoTypes.join(", ")}`);

  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const p of parsed) {
    for (const e of p.set.entries) {
      const key = `${e.id}|${e.thermoType ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(e);
    }
  }

  const bases = [...new Set(parsed.map((p) => p.set.energyBasis ?? "total"))];
  if (bases.length > 1)
    throw new Error(
      "エネルギーの基準が異なるファイルが混在しています。同じ方法で取得し直してください",
    );

  const warnings = [...new Set(parsed.flatMap((p) => p.warnings))];
  const mpFiles = parsed.filter((p) => p.mp);
  if (mpFiles.length) {
    const docs = new Set(mpFiles.flatMap((p) => p.mp!.ids)).size;
    const total = Math.max(...mpFiles.map((p) => p.mp!.total ?? 0));
    if (total > docs) {
      const pages = Math.ceil(total / PER_PAGE);
      warnings.push(
        `MP のデータが ${total} 件中 ${docs} 件しかありません。_page=1〜${pages} の全ページを取得して、まとめて読み込んでください。`,
      );
    }
  }

  const first = parsed[0].set;
  return {
    set: {
      version: 1,
      source: parsed.length > 1 ? `${first.source} (${parsed.length} files)` : first.source,
      thermoType: thermoTypes[0] ?? first.thermoType,
      elements: [...new Set(parsed.flatMap((p) => p.set.elements))].sort(),
      fetchedAt: first.fetchedAt,
      energyBasis: first.energyBasis,
      // Individual pages may omit elemental references or stable compounds. Re-align
      // against the complete stable hull after merging, independent of page boundaries.
      entries: first.energyBasis === "formation" ? alignToMpHull(entries) : entries,
    },
    warnings,
  };
}
