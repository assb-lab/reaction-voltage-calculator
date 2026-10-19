import { describe, expect, it } from "vite-plus/test";
import type { Entry } from "./entries";
import { filmForRegion } from "./film";
import { computeProfile } from "./profile";

const entry = (
  name: string,
  composition: Record<string, number>,
  e: number,
  v?: number,
): Entry => ({
  id: name,
  name,
  composition,
  energyPerAtom: e,
  volumePerAtom: v,
});

// S + 2 Li -> Li2S with S at 25 Å³/atom and Li2S at 15 Å³/atom: products / target volume = 45 / 25.
const entries = [
  entry("Li", { Li: 1 }, 0, 20),
  entry("S", { S: 1 }, 0, 25),
  entry("Li2S", { Li: 2, S: 1 }, -1.5, 15),
];
const profile = computeProfile({ entries, formula: "S", ion: "Li" });
const sulfur = profile.regions.find((r) => r.x === 0)!;
const lithiated = profile.regions.find((r) => r.x > 0)!;

describe("filmForRegion", () => {
  it("has no film where the target itself is stable", () => {
    expect(filmForRegion(profile, sulfur, { diameterUm: 2, fraction: 0.5 })).toEqual({
      kind: "none",
    });
  });

  it("grows a shell from the decomposed fraction including the volume change", () => {
    const film = filmForRegion(profile, lithiated, { diameterUm: 2, fraction: 0.5 });
    if (film.kind !== "film") throw new Error(film.kind);
    expect(lithiated.x).toBeCloseTo(2, 9);
    expect(film.volumeRatio).toBeCloseTo(1.8, 12);
    expect(film.volumeChange).toBeCloseTo(0.8, 12);
    // whole particle: 0.5 · 0.8 = +40 % volume, diameter × 1.4^(1/3)
    expect(film.particleVolumeChange).toBeCloseTo(0.4, 12);
    expect(film.diameterChange).toBeCloseTo(Math.cbrt(1.4) - 1, 12);
    expect(film.fullyDecomposed).toBe(false);
    // r = (1 - 0.5)^(1/3), R_out = (r^3 + 0.5 * 1.8)^(1/3) = 1.4^(1/3) (µm, R = 1)
    const r = Math.cbrt(0.5);
    expect(film.coreDiameterUm).toBeCloseTo(2 * r, 12);
    expect(film.outerDiameterUm).toBeCloseTo(2 * Math.cbrt(1.4), 12);
    expect(film.thicknessNm).toBeCloseTo((Math.cbrt(1.4) - r) * 1000, 9);
    expect(film.phases.map((p) => [p.entry.name, p.volFraction])).toEqual([["Li2S", 1]]);
    // half of S -> Li2S: 0.5 * 2 * F / (3.6 * 32.065) mAh/g
    expect(film.capacityMAhG).toBeCloseTo((0.5 * 2 * 96485.33212) / (3.6 * 32.065), 6);
  });

  it("converts the whole particle at 100 % and gives no film at 0 %", () => {
    const full = filmForRegion(profile, lithiated, { diameterUm: 2, fraction: 1 });
    if (full.kind !== "film") throw new Error(full.kind);
    expect(full.coreDiameterUm).toBe(0);
    expect(full.fullyDecomposed).toBe(true);
    expect(full.outerDiameterUm).toBeCloseTo(2 * Math.cbrt(1.8), 12);
    expect(full.particleVolumeChange).toBeCloseTo(0.8, 12);
    expect(full.thicknessNm).toBeCloseTo(Math.cbrt(1.8) * 1000, 9);
    const none = filmForRegion(profile, lithiated, { diameterUm: 2, fraction: 0 });
    if (none.kind !== "film") throw new Error(none.kind);
    expect(none.thicknessNm).toBeCloseTo(0, 9);
  });

  it("reports phases without volume data", () => {
    const noVolume = computeProfile({
      entries: entries.map((e) => (e.name === "Li2S" ? { ...e, volumePerAtom: undefined } : e)),
      formula: "S",
      ion: "Li",
    });
    const region = noVolume.regions.find((r) => r.x > 0)!;
    expect(filmForRegion(noVolume, region, { diameterUm: 2, fraction: 0.5 })).toEqual({
      kind: "unavailable",
      missing: ["Li2S"],
    });
  });

  it("splits a mixed film by volume, not by atoms", () => {
    const mixed = computeProfile({
      entries: [
        entry("Li", { Li: 1 }, 0, 20),
        entry("S", { S: 1 }, 0, 25),
        entry("Cl", { Cl: 1 }, 0, 30),
        entry("Li2S", { Li: 2, S: 1 }, -1.5, 15),
        entry("LiCl", { Li: 1, Cl: 1 }, -2, 20),
        entry("SCl", { S: 1, Cl: 1 }, -0.1, 22),
      ],
      formula: "SCl",
      ion: "Li",
    });
    const region = mixed.regions.at(-1)!;
    const film = filmForRegion(mixed, region, { diameterUm: 1, fraction: 0.1 });
    if (film.kind !== "film") throw new Error(film.kind);
    // SCl + 3 Li -> Li2S (3 atoms × 15) + LiCl (2 atoms × 20): 45 / 85 and 40 / 85 by volume
    const byName = Object.fromEntries(film.phases.map((p) => [p.entry.name, p.volFraction]));
    expect(byName.Li2S).toBeCloseTo(45 / 85, 12);
    expect(byName.LiCl).toBeCloseTo(40 / 85, 12);
  });
});
