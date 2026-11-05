import { ATOMIC_MASS } from "./elements";
import type { Entry } from "./entries";
import { volumeForRegion } from "./volume";
import type { Profile, Region } from "./profile";

export { GAS_ELEMENTS, gasMatcher } from "./volume";

/** Faraday constant (C/mol). */
const FARADAY = 96485.33212;

export interface FilmOptions {
  /** Particle diameter (µm). */
  diameterUm: number;
  /** Decomposed fraction of the particle volume (0–1). Ignored when `chargeMAhG` is given. */
  fraction: number;
  /**
   * Reacted charge per gram of target (mAh/g). When given, each region's decomposed fraction is
   * derived from it: f = Q / Q_full with Q_full = |x| · z · F / (3.6 M), capped at 100 %.
   */
  chargeMAhG?: number;
  /**
   * Extra phases released as gas (formulas or ids, as in the exclusion list), on top of the
   * elemental gases (GAS_ELEMENTS) which are always treated as gas.
   */
  gasPhases?: string[];
}

export interface FilmGas {
  entry: Entry;
  /** Units of the displayed formula (e.g. O2) per formula unit of the target. */
  amount: number;
  /** Gas released by the decomposed fraction per gram of target (mmol/g); null if a mass is unknown. */
  mmolPerGram: number | null;
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
  /** Charge mode, but the region's decomposition passes no charge (x = 0) or the mass is unknown. */
  | { kind: "chargeless" }
  | {
      kind: "film";
      /** Decomposed fraction used (0–1): the input, or derived from the charge. */
      fraction: number;
      /** Charge that decomposes the whole particle in this region (mAh/g); null if a mass is unknown. */
      fullChargeMAhG: number | null;
      /** The fraction was derived from `chargeMAhG` (charge mode). */
      fromCharge: boolean;
      /** Charge mode: the charge exceeds fullChargeMAhG, so the fraction was capped at 100 %. */
      capped: boolean;
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

  const fullChargeMAhG = capacity(profile, region, 1);
  let f: number;
  let capped = false;
  if (opts.chargeMAhG !== undefined) {
    if (fullChargeMAhG === null || !(fullChargeMAhG > 0)) return { kind: "chargeless" };
    const raw = Math.max(0, opts.chargeMAhG) / fullChargeMAhG;
    capped = raw > 1;
    f = Math.min(1, raw);
  } else {
    f = Math.min(1, Math.max(0, opts.fraction));
  }

  const volume = volumeForRegion(profile, region, opts.gasPhases);
  if (volume.kind !== "volume") return volume;
  const { volumeRatio } = volume;

  const R = opts.diameterUm / 2;
  // Solve in units of the original radius: cubing the dimensional radius can overflow/underflow.
  const coreScale = Math.cbrt(1 - f);
  const outerScale = Math.cbrt(1 - f + f * volumeRatio);
  // Rationalize the difference of cube roots so a very thin shell does not round to zero.
  const shellScale =
    f > 0 && volumeRatio > 0
      ? (f * volumeRatio) / (outerScale ** 2 + outerScale * coreScale + coreScale ** 2)
      : 0;

  return {
    kind: "film",
    fraction: f,
    fullChargeMAhG,
    fromCharge: opts.chargeMAhG !== undefined,
    capped,
    thicknessNm: R * shellScale * 1000,
    coreDiameterUm: opts.diameterUm * coreScale,
    outerDiameterUm: opts.diameterUm * outerScale,
    volumeRatio,
    volumeChange: volumeRatio - 1,
    particleVolumeChange: f * (volumeRatio - 1),
    diameterChange: outerScale - 1,
    fullyDecomposed: f >= 1,
    phases: volume.phases,
    gases: volume.gases.map((p) => {
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

/** f · |x| · z · F / (3.6 M), in mAh per gram of target (F in C/mol, M in g/mol). */
function capacity(profile: Profile, region: Region, f: number): number | null {
  const m = molarMass(profile);
  // Match the zero-transfer tolerance used by regionReaction; LP roundoff is not a reaction charge.
  const uptake = Math.abs(region.x) < 1e-6 ? 0 : Math.abs(region.x);
  return m === null ? null : (f * uptake * profile.charge * FARADAY) / (3.6 * m);
}
