import type { Entry } from "../core/entries";
import { parseFormula } from "../core/formula";
import type { EntrySet } from "../data/io";

/** Illustrative reference energies (eV/atom); NOT Materials Project values. */
const REFS: Record<string, number> = { Li: -1.91, P: -5.41, S: -4.13, Cl: -1.85 };

/** [formula, formation energy per atom (eV/atom)] — invented numbers for trying the UI offline. */
const PHASES: [string, number][] = [
  ["Li", 0],
  ["P", 0],
  ["S", 0],
  ["Cl", 0],
  ["Li2S", -1.45],
  ["LiS", -1.15],
  ["Li3P", -0.55],
  ["LiP", -0.42],
  ["LiCl", -1.85],
  ["Li3PS4", -1.18],
  ["P2S5", -0.12],
  ["PCl3", -0.45],
  ["SCl2", -0.05],
  ["Li6PS5Cl", -1.36],
];

export function demoEntrySet(): EntrySet {
  const entries: Entry[] = PHASES.map(([name, f], i) => {
    const composition = parseFormula(name);
    const atoms = Object.values(composition).reduce((a, b) => a + b, 0);
    const refE = Object.entries(composition).reduce((s, [el, n]) => s + (n / atoms) * REFS[el], 0);
    return { id: `demo-${i + 1}`, name, composition, energyPerAtom: f + refE, thermoType: "demo" };
  });
  return {
    version: 1,
    source: "demo (fictitious energies)",
    elements: Object.keys(REFS).sort(),
    entries,
  };
}
