import type { Entry } from "../core/entries";
import { formatFormula, numAtoms, reduceComposition, type Composition } from "../core/formula";

export interface EntrySet {
  version: 1;
  source: string;
  thermoType?: string;
  elements: string[];
  fetchedAt?: string;
  entries: Entry[];
}

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

/**
 * Parse entries from JSON: this app's EntrySet, a bare Entry[], or a list of
 * pymatgen ComputedEntry / ComputedStructureEntry dicts (`entry.as_dict()`).
 */
export function parseEntrySet(text: string): EntrySet {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON として読み込めません");
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
  return {
    version: 1,
    source: meta.source ?? (Array.isArray(raw) ? "imported" : "file"),
    thermoType: meta.thermoType ?? entries.find((e) => e.thermoType)?.thermoType,
    elements,
    fetchedAt: meta.fetchedAt,
    entries,
  };
}
