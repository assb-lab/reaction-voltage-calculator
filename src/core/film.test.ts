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

  it.each([-15, 0, NaN, Infinity, "15"])("treats invalid product volume %s as unavailable", (v) => {
    const p = computeProfile({
      entries: entries.map((e) => (e.name === "Li2S" ? { ...e, volumePerAtom: v as number } : e)),
      formula: "S",
      ion: "Li",
    });
    expect(filmForRegion(p, p.regions.at(-1)!, { diameterUm: 2, fraction: 0.5 })).toEqual({
      kind: "unavailable",
      missing: ["Li2S"],
    });
  });

  it("does not compute a film from a negative target volume", () => {
    const p = computeProfile({
      entries: entries.map((e) => (e.name === "S" ? { ...e, volumePerAtom: -25 } : e)),
      formula: "S",
      ion: "Li",
    });
    expect(filmForRegion(p, p.regions.at(-1)!, { diameterUm: 2, fraction: 0.5 })).toEqual({
      kind: "unavailable",
      missing: ["S"],
    });
  });

  it.each([1e-200, 1e200])("scales linearly with diameter %s without cubing it", (d) => {
    const film = filmForRegion(profile, lithiated, { diameterUm: d, fraction: 0.5 });
    if (film.kind !== "film") throw new Error(film.kind);
    expect(film.outerDiameterUm / d).toBeCloseTo(Math.cbrt(1.4), 12);
    expect(film.thicknessNm / (d * 500)).toBeCloseTo(Math.cbrt(1.4) - Math.cbrt(0.5), 12);
    expect(film.diameterChange).toBeCloseTo(Math.cbrt(1.4) - 1, 12);
  });

  it("retains a positive shell thickness when the two radii round to the same number", () => {
    const film = filmForRegion(profile, lithiated, { diameterUm: 2, fraction: 1e-18 });
    if (film.kind !== "film") throw new Error(film.kind);
    expect(film.thicknessNm / 1e-18).toBeCloseTo(600, 9);
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

describe("gas release", () => {
  // MP volumes (Å³/atom): Li2O 8.40, Li2O2 7.89, O2 13.46 (a molecular crystal of solid O2)
  const oxide = [
    entry("Li", { Li: 1 }, 0, 20.3),
    entry("O2", { O: 2 }, 0, 13.46),
    entry("Li2O", { Li: 2, O: 1 }, -2.0, 8.4),
    entry("Li2O2", { Li: 2, O: 2 }, -1.6, 7.89),
  ];
  const p = computeProfile({ entries: oxide, formula: "Li2O", ion: "Li" });
  const top = p.regions[0];

  it("releases elemental gases instead of counting them as solid film", () => {
    expect(top.phases.map((ph) => ph.entry.name)).toEqual(["O2"]);
    const film = filmForRegion(p, top, { diameterUm: 2, fraction: 0.5 });
    if (film.kind !== "film") throw new Error(film.kind);
    expect(film.phases).toEqual([]);
    expect(film.gases.map((g) => [g.entry.name, g.amount])).toEqual([["O2", 0.5]]);
    // Li2O -> 1/2 O2 (gas): nothing solid remains, so no film and the particle shrinks to its core
    expect(film.volumeRatio).toBe(0);
    expect(film.thicknessNm).toBeCloseTo(0, 9);
    expect(film.outerDiameterUm).toBeCloseTo(2 * Math.cbrt(0.5), 12);
    expect(film.volumeChange).toBe(-1);
    // 0.5 decomposed × 0.5 O2 per Li2O (29.88 g/mol)
    expect(film.gases[0].mmolPerGram).toBeCloseTo((0.5 * 0.5 * 1000) / 29.8814, 3);
  });

  it("keeps solid products and needs no volume for gases", () => {
    const noGasVolume = computeProfile({
      entries: oxide.map((e) => (e.name === "O2" ? { ...e, volumePerAtom: undefined } : e)),
      formula: "Li2O",
      ion: "Li",
    });
    const peroxide = noGasVolume.regions.find((r) =>
      r.phases.some((ph) => ph.entry.name === "Li2O2"),
    )!;
    const film = filmForRegion(noGasVolume, peroxide, { diameterUm: 1, fraction: 0.1 });
    expect(film.kind).toBe("film");
    expect(
      filmForRegion(noGasVolume, noGasVolume.regions[0], { diameterUm: 1, fraction: 0.1 }).kind,
    ).toBe("film");
  });

  it("treats extra phases named by the user as gas", () => {
    const film = filmForRegion(profile, lithiated, {
      diameterUm: 2,
      fraction: 0.5,
      gasPhases: ["Li2S"],
    });
    if (film.kind !== "film") throw new Error(film.kind);
    expect(film.phases).toEqual([]);
    expect(film.gases.map((g) => g.entry.name)).toEqual(["Li2S"]);
  });
});
