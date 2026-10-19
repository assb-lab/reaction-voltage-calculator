import { ATOMIC_MASS } from "./elements";
import { entryMatcher, type Entry } from "./entries";
import { numAtoms } from "./formula";
import type { Profile, Region } from "./profile";

/** Faraday constant (C/mol). */
const FARADAY = 96485.33212;

export interface FilmOptions {
  /** Particle diameter (µm). */
  diameterUm: number;
  /** Decomposed fraction of the particle volume (0–1). */
  fraction: number;
  /**
   * Extra phases released as gas (formulas or ids, as in the exclusion list), on top of the
   * elemental gases (GAS_ELEMENTS) which are always treated as gas.
   */
  gasPhases?: string[];
}

/** Elements that are gases at room temperature: their elemental phases leave the particle. */
export const GAS_ELEMENTS = new Set(["H", "N", "O", "F", "Cl", "He", "Ne", "Ar", "Kr", "Xe", "Rn"]);

export interface FilmGas {
  entry: Entry;
  /** Units of the displayed formula (e.g. O2) per formula unit of the target. */
  amount: number;
  /** Gas released by the decomposed fraction per gram of target (mmol/g); null if a mass is unknown. */
  mmolPerGram: number | null;
}

/** Whether a phase is released as gas: an elemental gas, or one named in `gasPhases`. */
export function gasMatcher(gasPhases: string[] = []): (e: Entry) => boolean {
  const extra = gasPhases.map(entryMatcher);
  return (e) => {
    const els = Object.keys(e.composition);
    return (els.length === 1 && GAS_ELEMENTS.has(els[0])) || extra.some((m) => m(e));
  };
}

export interface FilmPhase {
  entry: Entry;
  /** Volume fraction of this phase in the film. */
  volFraction: number;
}

export type FilmResult =
  /** The target itself is the equilibrium phase: nothing decomposes. */
  | { kind: "none" }
  /** Some phase (or the target) has no volume data. */
  | { kind: "unavailable"; missing: string[] }
  | {
      kind: "film";
      /** Shell thickness (nm). */
      thicknessNm: number;
      /** Unreacted core and film outer diameters (µm). */
      coreDiameterUm: number;
      outerDiameterUm: number;
      /** Product volume / decomposed target volume. */
      volumeRatio: number;
      /** Relative volume change of the decomposed part: volumeRatio − 1. */
      volumeChange: number;
      /** Relative volume change of the whole particle: f · (volumeRatio − 1). */
      particleVolumeChange: number;
      /** Relative change of the particle (outer) diameter. */
      diameterChange: number;
      /** No core left (f = 100 %): the particle is entirely products, not a film. */
      fullyDecomposed: boolean;
      /** Solid products forming the film (gases excluded). */
      phases: FilmPhase[];
      /** Products released as gas: not part of the film or its volume. */
      gases: FilmGas[];
      /** Charge for the decomposed fraction per gram of target (mAh/g); null if a mass is unknown. */
      capacityMAhG: number | null;
    };

/**
 * Film of decomposition products on a spherical particle of the target, decomposing from the
 * surface inward (shrinking core). The decomposed fraction f of the particle volume leaves a core of
 * radius r = R (1 − f)^(1/3); its products, with their own molar volume (MP volume per atom), form a
 * dense, uniformly mixed shell around the core: R_out³ = r³ + f R³ · V_products / V_target.
 * The film thickness is R_out − r, so volume expansion or shrinkage on (de)lithiation is included.
 * Gaseous products (O2, Cl2, … and `gasPhases`) leave the particle: they add no volume to the film
 * and are reported separately.
 */
export function filmForRegion(profile: Profile, region: Region, opts: FilmOptions): FilmResult {
  const target = profile.targetEntry;
  if (region.phases.length === 1 && target && region.phases[0].entry === target)
    return { kind: "none" };

  const isGas = gasMatcher(opts.gasPhases);
  const solids = region.phases.filter((p) => !isGas(p.entry));
  const gases = region.phases.filter((p) => isGas(p.entry));
  const missing = [
    ...(target && target.volumePerAtom ? [] : [target?.name ?? profile.formula]),
    ...solids.filter((p) => !p.entry.volumePerAtom).map((p) => p.entry.name),
  ];
  if (missing.length) return { kind: "unavailable", missing: [...new Set(missing)] };

  const targetVolume = numAtoms(profile.target) * target!.volumePerAtom!;
  const volumes = solids.map((p) => p.atoms * p.entry.volumePerAtom!);
  const productVolume = volumes.reduce((a, b) => a + b, 0);
  const volumeRatio = productVolume / targetVolume;

  const f = Math.min(1, Math.max(0, opts.fraction));
  const R = opts.diameterUm / 2;
  const r = R * Math.cbrt(1 - f);
  const rOut = Math.cbrt(r ** 3 + f * R ** 3 * volumeRatio);

  return {
    kind: "film",
    thicknessNm: (rOut - r) * 1000,
    coreDiameterUm: 2 * r,
    outerDiameterUm: 2 * rOut,
    volumeRatio,
    volumeChange: volumeRatio - 1,
    particleVolumeChange: f * (volumeRatio - 1),
    diameterChange: rOut / R - 1,
    fullyDecomposed: f >= 1,
    phases: solids.map((p, i) => ({
      entry: p.entry,
      volFraction: volumes[i] / productVolume,
    })),
    gases: gases.map((p) => {
      const m = molarMass(profile);
      return {
        entry: p.entry,
        amount: p.amount,
        mmolPerGram: m === null ? null : (f * p.amount * 1000) / m,
      };
    }),
    capacityMAhG: capacity(profile, region, f),
  };
}

/** Molar mass of the target formula (g/mol); null if an element mass is unknown. */
function molarMass(profile: Profile): number | null {
  let m = 0;
  for (const [el, n] of Object.entries(profile.target)) {
    const a = ATOMIC_MASS[el];
    if (a === undefined) return null;
    m += n * a;
  }
  return m;
}

/** f · |x| · z · F / M, in mAh per gram of target. */
function capacity(profile: Profile, region: Region, f: number): number | null {
  const m = molarMass(profile);
  return m === null ? null : (f * Math.abs(region.x) * profile.charge * FARADAY) / (3.6 * m);
}
