import { prepareEntries, type Entry, type PreparedEntry, type PreparedSet } from "./entries";
import { formatNumber, numAtoms, parseFormula, type Composition } from "./formula";
import { solveLp } from "./simplex";

/** Charge of the working ion used to convert chemical potential to voltage. */
export const ION_CHARGE: Record<string, number> = {
  Li: 1,
  Na: 1,
  K: 1,
  Rb: 1,
  Cs: 1,
  Ag: 1,
  Cu: 1,
  Mg: 2,
  Ca: 2,
  Zn: 2,
  Al: 3,
};

const T_TOL = 1e-7;
/**
 * Minimum stabilisation (eV/atom). A target placed exactly on the hull usually lies on a facet of
 * its decomposition products, which makes the equilibrium at x = 0 degenerate; lowering it by a
 * negligible amount makes it a hull vertex, so δ = 0 yields the limiting stability window.
 */
const STABILIZE_EPS = 1e-7;
const E_TOL = 1e-9;

export interface PhaseAmount {
  entry: Entry;
  /** Units of the phase's displayed formula per formula unit of the target. */
  amount: number;
}

/** A μ window in which one phase assemblage is in equilibrium (a vertical segment of the profile). */
export interface Region {
  /** Chemical potential bounds of the working ion relative to its metal (eV). */
  muMin: number;
  muMax: number;
  /** Voltage bounds vs. the ion metal (V). vMax is Infinity for the most oxidised region. */
  vMin: number;
  vMax: number;
  /** Working-ion content per target formula unit. */
  ionAmount: number;
  /** Uptake relative to the target (negative = extraction). */
  x: number;
  phases: PhaseAmount[];
}

/** A two-phase-equilibrium voltage plateau between two neighbouring regions. */
export interface Plateau {
  mu: number;
  voltage: number;
  xStart: number;
  xEnd: number;
  /** Index of the region on the oxidised (low-x) side. */
  region: number;
}

export interface StabilityWindow {
  /** Reduction limit (V). */
  low: number;
  /** Oxidation limit (V); Infinity when no oxidation occurs. */
  high: number;
  /** True when the equilibrium at x = 0 is the target phase alone. */
  targetIsPhase: boolean;
}

export interface StabilizeOptions {
  /** Put the target onto the hull (useful for metastable phases). */
  enabled: boolean;
  /** Extra stabilisation below the hull (eV/atom). 0 means infinitesimally below (see STABILIZE_EPS). */
  delta: number;
  /** Set false to leave an absent target unassessed instead of creating a virtual phase. */
  allowVirtual?: boolean;
}

export interface ProfileInput {
  entries: Entry[];
  formula: string;
  ion: string;
  stabilize?: StabilizeOptions;
}

export interface Profile {
  formula: string;
  target: Composition;
  ion: string;
  charge: number;
  elements: string[];
  /** Absolute energy per atom of the ion reference (eV/atom). */
  ionReference: number;
  /** Ion content of the target per formula unit. */
  ionInTarget: number;
  regions: Region[];
  plateaus: Plateau[];
  window: StabilityWindow | null;
  /** Energy above hull of the best matching target entry (eV/atom); null when no entry matches. */
  eAboveHull: number | null;
  /** Entry treated as the target phase, if any. */
  targetEntry: Entry | null;
  stabilized: boolean;
  nEntries: number;
}

function sameFraction(a: Composition, b: Composition): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-6) return false;
  return true;
}

function fractionOf(comp: Composition): Composition {
  const total = numAtoms(comp);
  const out: Composition = {};
  for (const [el, n] of Object.entries(comp)) out[el] = n / total;
  return out;
}

/** Minimum formation energy per atom at the given composition over `entries`. */
export function hullEnergy(
  entries: PreparedEntry[],
  elements: string[],
  comp: Composition,
): number {
  const frac = fractionOf(comp);
  const A = elements.map((el) => entries.map((e) => e.fraction[el] ?? 0));
  const b = elements.map((el) => frac[el] ?? 0);
  return solveLp(
    A,
    b,
    Float64Array.from(entries, (e) => e.formationPerAtom),
  ).value;
}

interface GrandSolution {
  mu: number;
  /** Σ n_i E_f,i : grand potential intercept at μ = 0. */
  energy: number;
  ionAmount: number;
  value: number;
  phases: PhaseAmount[];
}

function makeGrandSolver(set: PreparedSet, target: Composition, ion: string) {
  const cons = set.elements.filter((el) => el !== ion);
  const cols = set.entries.filter((e) => cons.some((el) => (e.fraction[el] ?? 0) > 0));
  const A = cons.map((el) => cols.map((e) => e.fraction[el] ?? 0));
  const b = cons.map((el) => target[el] ?? 0);
  const cost = new Float64Array(cols.length);
  return (mu: number): GrandSolution => {
    for (let i = 0; i < cols.length; i++) {
      cost[i] = cols[i].formationPerAtom - mu * (cols[i].fraction[ion] ?? 0);
    }
    const { x, value } = solveLp(A, b, cost);
    let energy = 0;
    let ionAmount = 0;
    const phases: PhaseAmount[] = [];
    for (let i = 0; i < cols.length; i++) {
      if (x[i] <= 1e-12) continue;
      energy += x[i] * cols[i].formationPerAtom;
      ionAmount += x[i] * (cols[i].fraction[ion] ?? 0);
      if (x[i] > 1e-9)
        phases.push({ entry: cols[i].entry, amount: x[i] / cols[i].atomsPerFormula });
    }
    return { mu, energy, ionAmount, value, phases };
  };
}

/** Find all μ where the equilibrium Li content jumps (Eisner–Severance on the concave g(μ)). */
function findBreakpoints(
  solve: (mu: number) => GrandSolution,
  lo: GrandSolution,
  hi: GrandSolution,
) {
  const out: number[] = [];
  const recurse = (a: GrandSolution, b: GrandSolution, depth: number) => {
    if (b.ionAmount - a.ionAmount < T_TOL) return;
    const mu = (b.energy - a.energy) / (b.ionAmount - a.ionAmount);
    const line = a.energy - a.ionAmount * mu;
    const c = solve(mu);
    if (depth > 200 || c.value >= line - E_TOL * Math.max(1, Math.abs(line))) {
      out.push(mu);
      return;
    }
    recurse(a, c, depth + 1);
    recurse(c, b, depth + 1);
  };
  recurse(lo, hi, 0);
  out.sort((p, q) => p - q);
  return out.filter((mu, i) => i === 0 || mu - out[i - 1] > 1e-9);
}

export function computeProfile(input: ProfileInput): Profile {
  const { ion } = input;
  const target = parseFormula(input.formula);
  const charge = ION_CHARGE[ion] ?? 1;
  const elements = [...new Set([...Object.keys(target), ion])].sort();
  if (elements.length < 2) throw new Error(`${ion} 以外の元素を含む組成を指定してください`);
  const base = prepareEntries(input.entries, elements);

  // Target phase: energy above hull, optional stabilisation.
  const targetFrac = fractionOf(target);
  const isTarget = (e: PreparedEntry) => sameFraction(e.fraction, targetFrac);
  const matching = base.entries
    .filter(isTarget)
    .sort((p, q) => p.formationPerAtom - q.formationPerAtom);
  const others = base.entries.filter((e) => !isTarget(e));
  const hullAll = hullEnergy(base.entries, base.elements, target);
  const best = matching[0] ?? null;
  const eAboveHull = best ? Math.max(0, best.formationPerAtom - hullAll) : null;

  let set: PreparedSet = base;
  let targetEntry = best?.entry ?? null;
  const stabilized =
    !!input.stabilize?.enabled && (!!best || input.stabilize.allowVirtual !== false);
  if (stabilized) {
    const f = hullAll - Math.max(0, input.stabilize!.delta) - STABILIZE_EPS;
    const refE = Object.entries(targetFrac).reduce((s, [el, x]) => s + x * base.refs[el], 0);
    targetEntry = best
      ? { ...best.entry, energyPerAtom: f + refE }
      : { id: "virtual", name: input.formula, composition: { ...target }, energyPerAtom: f + refE };
    const atomsPerFormula = best?.atomsPerFormula ?? numAtoms(target);
    set = {
      ...base,
      entries: [
        ...others,
        ...matching.slice(1),
        { entry: targetEntry, fraction: targetFrac, formationPerAtom: f, atomsPerFormula },
      ],
    };
  }

  const solve = makeGrandSolver(set, target, ion);
  // The ion-free assemblage is the exact oxidised endpoint at μ → −∞.
  // A fixed finite scan limit can miss transitions in dilute-ion compositions.
  const lo = makeGrandSolver(
    { ...set, entries: set.entries.filter((e) => !e.fraction[ion]) },
    target,
    ion,
  )(0);
  const hi = solve(0);
  const mus = findBreakpoints(solve, lo, hi);

  const bounds = [-Infinity, ...mus, 0];
  const regions: Region[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const muMin = bounds[i];
    const muMax = bounds[i + 1];
    const sample = muMin === -Infinity ? muMax - 1 : (muMin + muMax) / 2;
    const s = solve(sample);
    regions.push({
      muMin,
      muMax,
      vMin: -muMax / charge,
      vMax: muMin === -Infinity ? Infinity : -muMin / charge,
      ionAmount: s.ionAmount,
      x: 0,
      phases: s.phases.sort((p, q) => p.entry.name.localeCompare(q.entry.name)),
    });
  }
  const ionInTarget = target[ion] ?? 0;
  for (const r of regions) r.x = r.ionAmount - ionInTarget;

  const plateaus: Plateau[] = mus.map((mu, i) => ({
    mu,
    voltage: -mu / charge,
    xStart: regions[i].x,
    xEnd: regions[i + 1].x,
    region: i,
  }));

  let window: StabilityWindow | null = null;
  const at = regions.find((r) => Math.abs(r.x) < 1e-6);
  if (at) {
    window = {
      low: at.vMin,
      high: at.vMax,
      targetIsPhase:
        at.phases.length === 1 &&
        !!targetEntry &&
        sameFraction(fractionOf(at.phases[0].entry.composition), targetFrac),
    };
  } else {
    const p = plateaus.find((q) => q.xStart < 0 && q.xEnd > 0);
    if (p) window = { low: p.voltage, high: p.voltage, targetIsPhase: false };
  }

  return {
    formula: input.formula,
    target,
    ion,
    charge,
    elements: base.elements,
    ionReference: base.refs[ion],
    ionInTarget,
    regions,
    plateaus,
    window,
    eAboveHull,
    targetEntry,
    stabilized,
    nEntries: set.entries.length,
  };
}

/** "Li6PS5Cl + 8 Li → 5 Li2S + Li3P + LiCl" style equation for a region. */
export function regionReaction(profile: Profile, region: Region): string {
  const fmt = (n: number) => (Math.abs(n - 1) < 1e-6 ? "" : `${formatNumber(n)} `);
  const products = region.phases.map((p) => `${fmt(p.amount)}${p.entry.name}`).join(" + ");
  const x = region.x;
  if (Math.abs(x) < 1e-6) return `${profile.formula} → ${products}`;
  if (x > 0) return `${profile.formula} + ${fmt(x)}${profile.ion} → ${products}`;
  return `${profile.formula} → ${products} + ${fmt(-x)}${profile.ion}`;
}
