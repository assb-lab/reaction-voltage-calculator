import { numAtoms, parseFormula, reduceComposition, type Composition } from "./formula";
import { t } from "../i18n";
import { normalizeMpId } from "./mpid";

/** One computed phase: composition (any multiple) and corrected total energy per atom. */
export interface Entry {
  id: string;
  name: string;
  composition: Composition;
  energyPerAtom: number;
  thermoType?: string;
  /** MP energy above hull as reported by the source (eV/atom), informational only. */
  eAboveHull?: number;
  /** Volume per atom (Å^3/atom), if known. */
  volumePerAtom?: number;
}

/** Entry with derived per-atom data used by the solvers. */
export interface PreparedEntry {
  entry: Entry;
  /** Atomic fractions. */
  fraction: Composition;
  /** Formation energy per atom relative to the elemental references (eV/atom). */
  formationPerAtom: number;
  /** Atoms per displayed formula (or reduced composition for non-formula labels). */
  atomsPerFormula: number;
}

export interface PreparedSet {
  elements: string[];
  /** Lowest energy per atom of each elemental phase. */
  refs: Record<string, number>;
  entries: PreparedEntry[];
}

/** Keep only entries inside `elements`, compute formation energies against the elemental references. */
export function prepareEntries(entries: Entry[], elements: string[]): PreparedSet {
  const elSet = new Set(elements);
  const inside = entries.filter((e) => Object.keys(e.composition).every((el) => elSet.has(el)));
  const refs: Record<string, number> = {};
  for (const e of inside) {
    const els = Object.keys(e.composition);
    if (els.length === 1) {
      const el = els[0];
      if (!(el in refs) || e.energyPerAtom < refs[el]) refs[el] = e.energyPerAtom;
    }
  }
  const missing = elements.filter((el) => !(el in refs));
  if (missing.length) throw new Error(t("entries.missingRefs", { elements: missing.join(", ") }));

  const prepared = inside.map((entry): PreparedEntry => {
    const total = numAtoms(entry.composition);
    const fraction: Composition = {};
    let refE = 0;
    for (const [el, n] of Object.entries(entry.composition)) {
      fraction[el] = n / total;
      refE += (n / total) * refs[el];
    }
    const { reduced } = reduceComposition(entry.composition);
    let atomsPerFormula = numAtoms(reduced);
    try {
      const displayed = parseFormula(entry.name);
      const displayedAtoms = numAtoms(displayed);
      const keys = new Set([...Object.keys(displayed), ...Object.keys(fraction)]);
      if (
        [...keys].every(
          (el) => Math.abs((displayed[el] ?? 0) / displayedAtoms - (fraction[el] ?? 0)) < 1e-9,
        )
      )
        atomsPerFormula = displayedAtoms;
    } catch {
      // Non-formula phase labels retain reduced-composition units.
    }
    return {
      entry,
      fraction,
      formationPerAtom: entry.energyPerAtom - refE,
      atomsPerFormula,
    };
  });
  return { elements: [...elements].sort(), refs, entries: prepared };
}

export interface ExcludeResult {
  /** Entries left after exclusion. */
  entries: Entry[];
  /** Entries removed. */
  excluded: Entry[];
  /** Items that matched no entry (typos, or phases absent from the data). */
  unmatched: string[];
}

/** Split a comma (or newline / 、) separated exclusion list into trimmed, de-duplicated items. */
export function parseExcludeList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,，、\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function sameComposition(a: Composition, b: Composition): boolean {
  const na = numAtoms(a);
  const nb = numAtoms(b);
  const els = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...els].every((el) => Math.abs((a[el] ?? 0) / na - (b[el] ?? 0) / nb) < 1e-9);
}

/**
 * Remove entries named in `items`. An item equal to an entry id (case-insensitive) removes that entry;
 * otherwise it is read as a formula and removes every entry with the same composition ratio
 * (all polymorphs).
 */
export function excludeEntries(entries: Entry[], items: string[]): ExcludeResult {
  const matchers = items.map((item) => {
    let comp: Composition | null = null;
    try {
      comp = parseFormula(item);
    } catch {
      // Not a formula: only matches ids.
    }
    const id = normalizeMpId(item).toLowerCase();
    return (e: Entry) =>
      normalizeMpId(e.id).toLowerCase() === id ||
      (comp !== null && sameComposition(comp, e.composition));
  });
  const hits = items.map(() => false);
  const kept: Entry[] = [];
  const excluded: Entry[] = [];
  for (const e of entries) {
    let drop = false;
    matchers.forEach((m, i) => {
      if (m(e)) drop = hits[i] = true;
    });
    (drop ? excluded : kept).push(e);
  }
  return { entries: kept, excluded, unmatched: items.filter((_, i) => !hits[i]) };
}
