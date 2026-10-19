import { describe, expect, it } from "vite-plus/test";
import { excludeEntries, parseExcludeList, type Entry } from "./entries";
import { formatFormula, parseFormula, reduceComposition } from "./formula";
import { computeProfile, regionReaction } from "./profile";
import { solveLp } from "./simplex";

describe("parseFormula", () => {
  it("parses simple, grouped and fractional formulas", () => {
    expect(parseFormula("Li6PS5Cl")).toEqual({ Li: 6, P: 1, S: 5, Cl: 1 });
    expect(parseFormula("Ca3(PO4)2")).toEqual({ Ca: 3, P: 2, O: 8 });
    expect(parseFormula("Li0.5CoO2")).toEqual({ Li: 0.5, Co: 1, O: 2 });
    expect(parseFormula("LiOH")).toEqual({ Li: 1, O: 1, H: 1 });
  });
  it("rejects malformed input", () => {
    expect(() => parseFormula("")).toThrow();
    expect(() => parseFormula("Li2(S")).toThrow();
    expect(() => parseFormula("2Li")).toThrow();
    expect(() => parseFormula("li2s")).toThrow();
  });
  it("reduces and formats", () => {
    expect(reduceComposition({ Li: 8, S: 4 })).toEqual({ reduced: { Li: 2, S: 1 }, factor: 4 });
    expect(formatFormula({ Li: 2, S: 1 })).toBe("Li2S");
  });
});

describe("solveLp", () => {
  it("solves a small equality LP", () => {
    // min x0 + 2 x1 + 3 x2, x0 + x1 + x2 = 1, x1 + 2 x2 = 1
    const r = solveLp(
      [
        [1, 1, 1],
        [0, 1, 2],
      ],
      [1, 1],
      [1, 2, 3],
    );
    expect(r.value).toBeCloseTo(2, 9);
  });
  it("detects infeasibility", () => {
    expect(() => solveLp([[1, 1]], [-1], [1, 1])).toThrow(/infeasible/);
  });
});

/** Entry from formation energy per atom with zero elemental references. */
function entry(name: string, formationPerAtom: number): Entry {
  return { id: name, name, composition: parseFormula(name), energyPerAtom: formationPerAtom };
}

const LiS = [entry("Li", 0), entry("S", 0), entry("Li2S", -1.5), entry("LiS", -1.2)];

describe("computeProfile", () => {
  it("finds the plateaus of a binary Li-S system", () => {
    const p = computeProfile({ entries: LiS, formula: "S", ion: "Li" });
    expect(p.plateaus.map((q) => q.voltage)).toEqual([
      expect.closeTo(2.4, 9),
      expect.closeTo(2.1, 9),
    ]);
    expect(p.regions.map((r) => r.x)).toEqual([0, expect.closeTo(1, 9), expect.closeTo(2, 9)]);
    expect(p.regions.map((r) => r.phases.map((ph) => ph.entry.name))).toEqual([
      ["S"],
      ["LiS"],
      ["Li2S"],
    ]);
    expect(p.window).toEqual({ low: expect.closeTo(2.4, 9), high: Infinity, targetIsPhase: true });
    expect(regionReaction(p, p.regions[2])).toBe("S + 2 Li → Li2S");
  });

  it("gives the stability window of an intermediate phase", () => {
    const p = computeProfile({ entries: LiS, formula: "LiS", ion: "Li" });
    expect(p.window?.low).toBeCloseTo(2.1, 9);
    expect(p.window?.high).toBeCloseTo(2.4, 9);
    expect(p.window?.targetIsPhase).toBe(true);
    expect(p.eAboveHull).toBe(0);
    expect(regionReaction(p, p.regions[0])).toBe("LiS → S + Li");
  });

  it("handles metastable targets and stabilisation", () => {
    const meta = [entry("Li", 0), entry("S", 0), entry("Li2S", -1.5), entry("LiS", -1.0)];
    const p = computeProfile({ entries: meta, formula: "LiS", ion: "Li" });
    expect(p.eAboveHull).toBeCloseTo(0.125, 9);
    expect(p.plateaus).toHaveLength(1);
    expect(p.window).toEqual({
      low: expect.closeTo(2.25, 9),
      high: expect.closeTo(2.25, 9),
      targetIsPhase: false,
    });

    const s = computeProfile({
      entries: meta,
      formula: "LiS",
      ion: "Li",
      stabilize: { enabled: true, delta: 0.01 },
    });
    // LiS at -1.135 eV/atom: S + Li -> LiS at 2.27 V, LiS + Li -> Li2S at 2.23 V.
    expect(s.window?.high).toBeCloseTo(2.27, 6);
    expect(s.window?.low).toBeCloseTo(2.23, 6);
    expect(s.window?.targetIsPhase).toBe(true);
  });

  it("uses the ion charge for multivalent ions", () => {
    const p = computeProfile({
      entries: [entry("Mg", 0), entry("S", 0), entry("MgS", -1)],
      formula: "S",
      ion: "Mg",
    });
    expect(p.plateaus[0].voltage).toBeCloseTo(1, 9);
  });

  it("works in a ternary system with references at non-zero energy", () => {
    const shift = (e: Entry, ref: Record<string, number>): Entry => {
      const atoms = Object.values(e.composition).reduce((a, b) => a + b, 0);
      const refE = Object.entries(e.composition).reduce(
        (s, [el, n]) => s + (n / atoms) * ref[el],
        0,
      );
      return { ...e, energyPerAtom: e.energyPerAtom + refE };
    };
    const ref = { Li: -1.9, P: -5.4, S: -4.1 };
    const raw = [
      entry("Li", 0),
      entry("P", 0),
      entry("S", 0),
      entry("Li2S", -1.5),
      entry("Li3P", -0.6),
      entry("Li3PS4", -1.25),
    ];
    const p = computeProfile({
      entries: raw.map((e) => shift(e, ref)),
      formula: "Li3PS4",
      ion: "Li",
    });
    // Reduction: Li3PS4 + 8 Li -> 4 Li2S + Li3P.
    const last = p.regions[p.regions.length - 1];
    expect(last.x).toBeCloseTo(8, 9);
    expect(last.phases.map((ph) => ph.entry.name)).toEqual(["Li2S", "Li3P"]);
    // First Li3PS4 + 5 Li -> 4 Li2S + P (ΔG = -8 eV, 1.6 V), then P + 3 Li -> Li3P (0.8 V).
    expect(p.window?.low).toBeCloseTo(1.6, 9);
    expect(p.plateaus.map((q) => q.voltage)).toEqual([
      expect.closeTo(10 / 3, 9),
      expect.closeTo(1.6, 9),
      expect.closeTo(0.8, 9),
    ]);
    // Oxidation: Li3PS4 -> P + 4 S + 3 Li, ΔG = +10 eV -> 3.333 V.
    expect(p.window?.high).toBeCloseTo(10 / 3, 9);
  });
});

describe("review regressions", () => {
  it("stabilizes an ion-free elemental target without removing its only reference", () => {
    const p = computeProfile({
      entries: LiS,
      formula: "S",
      ion: "Li",
      stabilize: { enabled: true, delta: 0 },
    });
    expect(p.window?.high).toBe(Infinity);
    expect(p.plateaus[0].voltage).toBeCloseTo(2.4, 6);
  });

  it("places even a stable target delta below the existing hull", () => {
    const p = computeProfile({
      entries: LiS,
      formula: "LiS",
      ion: "Li",
      stabilize: { enabled: true, delta: 0.01 },
    });
    expect(p.window?.high).toBeCloseTo(2.42, 6);
    expect(p.window?.low).toBeCloseTo(2.08, 6);
  });

  it("balances molecular elemental phase formulas in reactions", () => {
    const p = computeProfile({
      entries: [entry("Li", 0), entry("O2", 0), entry("Li2O", -1)],
      formula: "Li2O",
      ion: "Li",
    });
    expect(regionReaction(p, p.regions[0])).toBe("Li2O → 0.5 O2 + 2 Li");
  });

  it.each(["Li(OH]", "Li[OH)", "Li()S"])("rejects malformed grouping: %s", (f) => {
    expect(() => parseFormula(f)).toThrow();
  });
});

it("finds oxidation transitions beyond the former 50 eV scan limit", () => {
  const p = computeProfile({
    entries: [entry("Li", 0), entry("S", 0), entry("Li0.01S", -0.75)],
    formula: "Li0.01S",
    ion: "Li",
  });
  expect(p.regions[0].ionAmount).toBe(0);
  expect(p.plateaus).toHaveLength(1);
  expect(p.plateaus[0].voltage).toBeCloseTo(75.75, 8);
});

describe("excludeEntries", () => {
  const e = (id: string, name: string, composition: Record<string, number>): Entry => ({
    id,
    name,
    composition,
    energyPerAtom: 0,
  });
  const entries = [
    e("mp-1", "Li2S", { Li: 8, S: 4 }),
    e("mp-2", "Li2S", { Li: 2, S: 1 }),
    e("mp-3", "LiS4", { Li: 1, S: 4 }),
    e("mp-4", "S", { S: 32 }),
  ];

  it("parses comma separated lists", () => {
    expect(parseExcludeList(" Li2S, mp-3 ,,LiS4、mp-3\n")).toEqual(["Li2S", "mp-3", "LiS4"]);
    expect(parseExcludeList("  ")).toEqual([]);
  });
  it("removes all polymorphs of a formula, by composition ratio", () => {
    const r = excludeEntries(entries, ["Li4S2"]);
    expect(r.excluded.map((x) => x.id)).toEqual(["mp-1", "mp-2"]);
    expect(r.entries.map((x) => x.id)).toEqual(["mp-3", "mp-4"]);
    expect(r.unmatched).toEqual([]);
  });
  it("removes a single entry by id (case-insensitive) and reports unmatched items", () => {
    const r = excludeEntries(entries, ["MP-2", "Li3P7", "foo"]);
    expect(r.excluded.map((x) => x.id)).toEqual(["mp-2"]);
    expect(r.unmatched).toEqual(["Li3P7", "foo"]);
  });
  it("changes the profile when a product phase is excluded", () => {
    const sys = [
      e("Li", "Li", { Li: 1 }),
      e("S", "S", { S: 1 }),
      { ...e("Li2S", "Li2S", { Li: 2, S: 1 }), energyPerAtom: -1.5 },
      { ...e("LiS4", "LiS4", { Li: 1, S: 4 }), energyPerAtom: -0.6 },
    ];
    const names = (es: Entry[]) =>
      computeProfile({ entries: es, formula: "S", ion: "Li" }).regions.flatMap((r) =>
        r.phases.map((p) => p.entry.name),
      );
    expect(names(sys)).toContain("LiS4");
    expect(names(excludeEntries(sys, ["LiS4"]).entries)).not.toContain("LiS4");
  });
});
