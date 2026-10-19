import type { Entry } from "../core/entries";
import { formatFormula, numAtoms, reduceComposition } from "../core/formula";

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
  const atoms = numAtoms(d.composition);
  const adjust = d.energy_adjustments
    ? d.energy_adjustments.reduce((s, a) => s + (a.value ?? 0), 0)
    : (d.correction ?? 0);
  return {
    id: d.entry_id ?? d.data?.material_id ?? `entry-${i}`,
    name: formatFormula(reduceComposition(d.composition).reduced),
    composition: d.composition,
    energyPerAtom: (d.energy + adjust) / atoms,
    thermoType: d.data?.thermo_type,
  };
}

function validateEntry(e: Entry, i: number): Entry {
  if (!e || typeof e !== "object") throw new Error(`entries[${i}] がオブジェクトではありません`);
  if (!e.composition || typeof e.composition !== "object")
    throw new Error(`entries[${i}].composition がありません`);
  for (const [el, n] of Object.entries(e.composition)) {
    if (!/^[A-Z][a-z]?$/.test(el) || !isNumber(n) || n < 0)
      throw new Error(`entries[${i}].composition が不正です`);
  }
  if (!isNumber(e.energyPerAtom))
    throw new Error(`entries[${i}].energyPerAtom が数値ではありません`);
  return {
    ...e,
    id: String(e.id ?? `entry-${i}`),
    name: e.name ?? formatFormula(reduceComposition(e.composition).reduced),
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
      return fromPymatgen(d, i);
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
