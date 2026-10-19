import { ATOMIC_MASS } from "./elements";
import type { Entry } from "./entries";
import { numAtoms } from "./formula";
import type { Profile, Region } from "./profile";

/** Faraday constant (C/mol). */
const FARADAY = 96485.33212;

export interface FilmOptions {
  /** Particle diameter (µm). */
  diameterUm: number;
  /** Decomposed fraction of the particle volume (0–1). */
  fraction: number;
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
      phases: FilmPhase[];
      /** Charge for the decomposed fraction per gram of target (mAh/g); null if a mass is unknown. */
      capacityMAhG: number | null;
    };

/**
 * Film of decomposition products on a spherical particle of the target, decomposing from the
 * surface inward (shrinking core). The decomposed fraction f of the particle volume leaves a core of
 * radius r = R (1 − f)^(1/3); its products, with their own molar volume (MP volume per atom), form a
 * dense, uniformly mixed shell around the core: R_out³ = r³ + f R³ · V_products / V_target.
 * The film thickness is R_out − r, so volume expansion or shrinkage on (de)lithiation is included.
 */
export function filmForRegion(profile: Profile, region: Region, opts: FilmOptions): FilmResult {
  const target = profile.targetEntry;
  if (region.phases.length === 1 && target && region.phases[0].entry === target)
    return { kind: "none" };

  const missing = [
    ...(target && target.volumePerAtom ? [] : [target?.name ?? profile.formula]),
    ...region.phases.filter((p) => !p.entry.volumePerAtom).map((p) => p.entry.name),
  ];
  if (missing.length) return { kind: "unavailable", missing: [...new Set(missing)] };

  const targetVolume = numAtoms(profile.target) * target!.volumePerAtom!;
  const volumes = region.phases.map((p) => p.atoms * p.entry.volumePerAtom!);
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
    phases: region.phases.map((p, i) => ({
      entry: p.entry,
      volFraction: volumes[i] / productVolume,
    })),
    capacityMAhG: capacity(profile, region, f),
  };
}

/** f · |x| · z · F / M, in mAh per gram of target. */
function capacity(profile: Profile, region: Region, f: number): number | null {
  let molarMass = 0;
  for (const [el, n] of Object.entries(profile.target)) {
    const m = ATOMIC_MASS[el];
    if (m === undefined) return null;
    molarMass += n * m;
  }
  return (f * Math.abs(region.x) * profile.charge * FARADAY) / (3.6 * molarMass);
}
