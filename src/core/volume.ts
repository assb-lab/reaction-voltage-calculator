import { entryMatcher, type Entry } from "./entries";
import { numAtoms } from "./formula";
import type { Profile, Region } from "./profile";

/** Elemental gases at room temperature are released, not counted as condensed products. */
export const GAS_ELEMENTS = new Set(["H", "N", "O", "F", "Cl", "He", "Ne", "Ar", "Kr", "Xe", "Rn"]);

export function gasMatcher(gasPhases: string[] = []): (e: Entry) => boolean {
  const extra = gasPhases.map(entryMatcher);
  return (e) => {
    const els = Object.keys(e.composition);
    return (els.length === 1 && GAS_ELEMENTS.has(els[0])) || extra.some((m) => m(e));
  };
}

export type VolumeResult =
  | { kind: "none" }
  | { kind: "unavailable"; missing: string[] }
  | {
      kind: "volume";
      /** Å³ per input target formula, not per crystallographic unit cell. */
      targetVolume: number;
      productVolume: number;
      volumeRatio: number;
      /** Relative change; multiply by 100 for percent. */
      volumeChange: number;
      phases: { entry: Entry; volFraction: number }[];
      /** Released formula units per input target formula. */
      gases: { entry: Entry; amount: number }[];
    };

const validVolume = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Complete conversion of one target formula to a region's equilibrium products. The working-ion
 * reservoir and released gases add no volume. No particle size, geometry or reacted charge is used.
 */
export function volumeForRegion(
  profile: Profile,
  region: Region,
  gasPhases: string[] = [],
): VolumeResult {
  const target = profile.targetEntry;
  if (region.phases.length === 1 && target && region.phases[0].entry === target)
    return { kind: "none" };
  const isGas = gasMatcher(gasPhases);
  const solids = region.phases.filter((p) => !isGas(p.entry));
  const gases = region.phases.filter((p) => isGas(p.entry));
  const missing = [
    ...(target && validVolume(target.volumePerAtom) ? [] : [target?.name ?? profile.formula]),
    ...solids.filter((p) => !validVolume(p.entry.volumePerAtom)).map((p) => p.entry.name),
  ];
  if (missing.length) return { kind: "unavailable", missing: [...new Set(missing)] };
  const targetVolume = numAtoms(profile.target) * target!.volumePerAtom!;
  const volumes = solids.map((p) => p.atoms * p.entry.volumePerAtom!);
  const productVolume = volumes.reduce((a, b) => a + b, 0);
  const volumeRatio = productVolume / targetVolume;
  return {
    kind: "volume",
    targetVolume,
    productVolume,
    volumeRatio,
    volumeChange: volumeRatio - 1,
    phases: solids.map((p, i) => ({ entry: p.entry, volFraction: volumes[i] / productVolume })),
    gases: gases.map((p) => ({ entry: p.entry, amount: p.amount })),
  };
}
