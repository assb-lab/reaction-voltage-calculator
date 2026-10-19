import { numAtoms, parseFormula, reduceComposition, type Composition } from "./formula";

/** One computed phase: composition (any multiple) and corrected total energy per atom. */
export interface Entry {
  id: string;
  name: string;
  composition: Composition;
  energyPerAtom: number;
  thermoType?: string;
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
  if (missing.length) throw new Error(`単体の基準エントリがありません: ${missing.join(", ")}`);

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
