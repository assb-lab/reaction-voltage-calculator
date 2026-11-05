import { describe, expect, it } from "vite-plus/test";
import { parseFormula } from "./formula";
import { computeProfile } from "./profile";
import { filmForRegion } from "./film";
import { volumeForRegion } from "./volume";

const entries = [
  { name: "Li", energyPerAtom: 0, volumePerAtom: 20 },
  { name: "S", energyPerAtom: 0, volumePerAtom: 25 },
  { name: "Li2S", energyPerAtom: -1.5, volumePerAtom: 15 },
].map((e) => ({ ...e, id: e.name, composition: parseFormula(e.name) }));

const profile = (formula = "S", data = entries) =>
  computeProfile({ entries: data, formula, ion: "Li" });

describe("initial-target-referenced solid volume", () => {
  it("computes S + 2 Li → Li2S as +80%, excluding the lithium reservoir", () => {
    const p = profile();
    expect(volumeForRegion(p, p.regions.at(-1)!)).toMatchObject({
      kind: "volume",
      targetVolume: 25,
      productVolume: 45,
      volumeRatio: 1.8,
      volumeChange: 0.8,
    });
  });

  it("computes extraction relative to the input target, not the oxidised endpoint", () => {
    const p = profile("Li2S");
    const v = volumeForRegion(p, p.regions[0]);
    expect(v.kind).toBe("volume");
    if (v.kind !== "volume") throw new Error(v.kind);
    expect(v.targetVolume).toBe(45);
    expect(v.productVolume).toBe(25);
    expect(v.volumeChange).toBeCloseTo(-4 / 9, 12);
  });

  it("normalises formula units before comparing volumes", () => {
    const p = profile("S2");
    const v = volumeForRegion(p, p.regions.at(-1)!);
    expect(v.kind).toBe("volume");
    if (v.kind !== "volume") throw new Error(v.kind);
    expect(v.targetVolume).toBe(50);
    expect(v.productVolume).toBe(90);
    expect(v.volumeChange).toBeCloseTo(0.8, 12);
  });

  it.each([undefined, 0, -1, NaN, Infinity, "15"])(
    "marks invalid product volume %s as missing",
    (value) => {
      const p = profile(
        "S",
        entries.map((e) => (e.name === "Li2S" ? { ...e, volumePerAtom: value as number } : e)),
      );
      expect(volumeForRegion(p, p.regions.at(-1)!)).toEqual({
        kind: "unavailable",
        missing: ["Li2S"],
      });
    },
  );

  it("reports missing initial volume and an absent target", () => {
    const p = profile(
      "S",
      entries.map((e) => (e.name === "S" ? { ...e, volumePerAtom: 0 } : e)),
    );
    expect(volumeForRegion(p, p.regions.at(-1)!)).toEqual({ kind: "unavailable", missing: ["S"] });
    const absent = profile("LiS");
    expect(volumeForRegion(absent, absent.regions.at(-1)!)).toEqual({
      kind: "unavailable",
      missing: ["LiS"],
    });
  });

  it("knows unchanged target volume is zero change even without structural data", () => {
    const p = profile(
      "S",
      entries.map((e) => ({ ...e, volumePerAtom: undefined as unknown as number })),
    );
    expect(volumeForRegion(p, p.regions[0])).toEqual({ kind: "none" });
  });

  it("excludes specified gases by formula or ID without requiring their volumes", () => {
    const p = profile(
      "S",
      entries.map((e) =>
        e.name === "Li2S"
          ? { ...e, id: "mp-1234", volumePerAtom: undefined as unknown as number }
          : e,
      ),
    );
    for (const gas of ["Li4S2", "mp-1234"]) {
      expect(volumeForRegion(p, p.regions.at(-1)!, [gas])).toMatchObject({
        kind: "volume",
        productVolume: 0,
        volumeChange: -1,
        phases: [],
        gases: [{ amount: 1, entry: { name: "Li2S" } }],
      });
    }
  });

  it("automatically releases O2, without using its molecular-crystal volume", () => {
    const oxide = [
      { name: "Li", energyPerAtom: 0, volumePerAtom: 20 },
      { name: "O2", energyPerAtom: 0, volumePerAtom: undefined },
      { name: "Li2O", energyPerAtom: -2, volumePerAtom: 8.4 },
    ].map((e) => ({ ...e, id: e.name, composition: parseFormula(e.name) }));
    const p = computeProfile({ entries: oxide, formula: "Li2O", ion: "Li" });
    expect(volumeForRegion(p, p.regions[0])).toMatchObject({
      kind: "volume",
      productVolume: 0,
      volumeChange: -1,
      gases: [{ amount: 0.5, entry: { name: "O2" } }],
    });
  });

  it("computes charge-free metastable decomposition independently of film charge mode", () => {
    const data = [
      ...entries,
      { id: "Cl", name: "Cl", composition: { Cl: 1 }, energyPerAtom: 0, volumePerAtom: 30 },
      {
        id: "SCl",
        name: "SCl",
        composition: { S: 1, Cl: 1 },
        energyPerAtom: 0.5,
        volumePerAtom: 20,
      },
    ];
    const p = computeProfile({ entries: data, formula: "SCl", ion: "Li" });
    const r = p.regions.find((r) => Math.abs(r.x) < 1e-6)!;
    expect(filmForRegion(p, r, { diameterUm: 1, fraction: 0, chargeMAhG: 10 }).kind).toBe(
      "chargeless",
    );
    expect(volumeForRegion(p, r)).toMatchObject({
      kind: "volume",
      targetVolume: 40,
      productVolume: 25,
      volumeChange: -0.375,
    });
  });

  it("matches the existing film volume at every decomposed region", () => {
    const p = profile();
    for (const r of p.regions) {
      const v = volumeForRegion(p, r);
      const f = filmForRegion(p, r, { diameterUm: 2, fraction: 0.5 });
      if (v.kind === "volume" && f.kind === "film") {
        expect(v.volumeChange).toBe(f.volumeChange);
        expect(f.particleVolumeChange).toBeCloseTo(v.volumeChange / 2, 12);
      }
    }
  });
});
