import { describe, expect, it } from "vite-plus/test";
import { prepareEntries } from "../src/core/entries";
import { computeProfile, hullEnergy, regionReaction } from "../src/core/profile";
import { parseEntryFiles, parseEntrySet } from "../src/data/io";
// Materials Project thermo docs (GGA_GGA+U_R2SCAN, database 2026-09-28, CC BY 4.0); see tests/mp/README.md.
import raw from "./mp/thermo_Cl-Li-P-S_GGA_GGA+U_R2SCAN.json?raw";

const set = parseEntrySet(raw);

describe("real MP data: Cl-Li-P-S, GGA_GGA+U_R2SCAN", () => {
  it("uses formation energies", () => {
    expect(set.energyBasis).toBe("formation");
    expect(set.entries).toHaveLength(108);
  });

  it("reproduces MP's energy above hull for every entry", () => {
    const prepared = prepareEntries(set.entries, set.elements);
    for (const p of prepared.entries) {
      const ehull =
        p.formationPerAtom - hullEnergy(prepared.entries, prepared.elements, p.entry.composition);
      expect(ehull, `${p.entry.name} ${p.entry.id}`).toBeCloseTo(p.entry.eAboveHull!, 6);
    }
  });

  it("gives the Li6PS5Cl reduction and oxidation products", () => {
    const p = computeProfile({ entries: set.entries, formula: "Li6PS5Cl", ion: "Li" });
    expect(p.eAboveHull).toBeCloseTo(0.0829463, 6);
    const last = p.regions.at(-1)!;
    expect(last.x).toBeCloseTo(8, 9);
    expect(regionReaction(p, last)).toBe("Li6PS5Cl + 8 Li → 5 Li2S + Li3P + LiCl");
    expect(p.regions[0].x).toBeCloseTo(-6, 9);
    // Metastable in MP: no window unless the phase is put on the hull.
    expect(p.window?.targetIsPhase).toBe(false);
    const s = computeProfile({
      entries: set.entries,
      formula: "Li6PS5Cl",
      ion: "Li",
      stabilize: { enabled: true, delta: 0 },
    });
    console.log(
      s.window,
      s.regions.map((r) => `${r.vMin.toFixed(3)}-${r.vMax.toFixed(3)} ${regionReaction(s, r)}`),
    );
  });

  it("flags data built from energy_per_atom", () => {
    const stale = JSON.parse(raw) as { data: Record<string, unknown>[] };
    for (const d of stale.data) delete d.formation_energy_per_atom;
    const { set: old, warnings } = parseEntryFiles([
      { name: "old.json", text: JSON.stringify(stale) },
    ]);
    expect(old.energyBasis).toBe("total");
    expect(warnings.join()).toMatch(/再取得/);
    // The inconsistent mixed-scheme energies are what produced the wrong 1.2 eV/atom hull distance.
    const p = computeProfile({ entries: old.entries, formula: "Li6PS5Cl", ion: "Li" });
    expect(p.eAboveHull).toBeGreaterThan(1);
  });
});
