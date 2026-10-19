import { describe, expect, it } from "vite-plus/test";
import { excludeEntries, prepareEntries } from "../src/core/entries";
import { filmForRegion } from "../src/core/film";
import { computeProfile, hullEnergy, regionReaction } from "../src/core/profile";
import { parseEntryFiles, parseEntrySet } from "../src/data/io";
import { renderProfileSvg } from "../src/ui/plot";
import { profileToJson } from "../src/ui/export";
// Materials Project thermo docs (GGA_GGA+U_R2SCAN, database 2026-09-28, CC BY 4.0); see tests/mp/README.md.
import raw from "./mp/thermo_Cl-Li-P-S_GGA_GGA+U_R2SCAN.json?raw";

const set = parseEntrySet(raw);

describe("real MP data: Cl-Li-P-S, GGA_GGA+U_R2SCAN", () => {
  it("uses formation energies", () => {
    expect(set.energyBasis).toBe("formation");
    expect(set.entries).toHaveLength(108);
  });

  it("converts MP AlphaIDs (mp-aaacebzk) to the legacy ids used on the MP website", () => {
    expect(set.entries.every((e) => /^mp-\d+$/.test(e.id))).toBe(true);
    const lpsc = set.entries.find((e) => e.name === "Li6PS5Cl");
    expect(lpsc?.id).toBe("mp-985592");
    for (const item of ["mp-985592", "mp-aaacebzk"])
      expect(excludeEntries(set.entries, [item]).excluded.map((e) => e.id)).toEqual(["mp-985592"]);
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
    expect(s.window?.targetIsPhase).toBe(true);
    expect(s.window?.low).toBeCloseTo(1.717, 3);
    expect(s.window?.high).toBeCloseTo(2.14, 3);
  });

  it("includes the actual MP target in the plot and export when evaluating the target phase", () => {
    const p = computeProfile({
      entries: set.entries,
      formula: "Li6PS5Cl",
      ion: "Li",
      stabilize: { enabled: true, delta: 0, allowVirtual: false },
    });
    const target = p.regions.find(
      (r) => r.phases.length === 1 && r.phases[0].entry.name === "Li6PS5Cl",
    );
    expect(target?.x).toBeCloseTo(0, 9);
    expect(target?.phases[0].entry.id).toBe("mp-985592");
    expect(target?.phases[0].amount).toBeCloseTo(1, 9);
    expect(p.eAboveHull).toBeCloseTo(0.0829463, 6);
    const svg = renderProfileSvg(p);
    expect(svg).toContain("対象相を hull 補正 (元の E_hull: 82.9 meV/atom)");
    // A phase label in the right-hand equilibrium panel, beyond the x=0 reference label.
    expect(svg).toMatch(
      /text-anchor="middle">Li<tspan[^>]*>6<\/tspan>.*PS<tspan[^>]*>5<\/tspan>.*Cl<\/text>/,
    );
    const exported = JSON.parse(profileToJson(p));
    expect(exported.stabilized).toBe(true);
    expect(
      exported.regions.some((r: { phases: { id: string }[] }) =>
        r.phases.some((e) => e.id === "mp-985592"),
      ),
    ).toBe(true);
  });

  it("computes the film of the Li6PS5Cl reduction products from MP volumes", () => {
    const profile = computeProfile({
      entries: set.entries,
      formula: "Li6PS5Cl",
      ion: "Li",
      stabilize: { enabled: true, delta: 0, allowVirtual: false },
    });
    const last = profile.regions.at(-1)!;
    const film = filmForRegion(profile, last, { diameterUm: 1, fraction: 0.3 });
    if (film.kind !== "film") throw new Error(film.kind);
    expect(film.phases.map((p) => p.entry.name).sort()).toEqual(["Li2S", "Li3P", "LiCl"]);
    expect(film.phases.reduce((s, p) => s + p.volFraction, 0)).toBeCloseTo(1, 12);
    // Reduction with 8 Li expands the solid, so the film is thicker than the decomposed depth.
    expect(film.volumeRatio).toBeGreaterThan(1);
    expect(film.outerDiameterUm).toBeGreaterThan(1);
    expect(film.thicknessNm).toBeGreaterThan((1 - Math.cbrt(0.7)) * 500);
    // 30 % of 8 Li per Li6PS5Cl (268.4 g/mol)
    expect(film.capacityMAhG).toBeCloseTo((0.3 * 8 * 96485.33212) / (3.6 * 268.36), 0);
  });

  it("does not fabricate a target entry when the requested composition is absent", () => {
    const p = computeProfile({
      entries: set.entries,
      formula: "Li5PS5Cl",
      ion: "Li",
      stabilize: { enabled: true, delta: 0, allowVirtual: false },
    });
    expect(p.targetEntry).toBeNull();
    expect(p.eAboveHull).toBeNull();
    expect(p.stabilized).toBe(false);
    expect(p.regions.flatMap((r) => r.phases).every((ph) => ph.entry.id !== "virtual")).toBe(true);
  });

  it("gives identical energies and profiles when raw data spans multiple pages", () => {
    const docs = (JSON.parse(raw) as { data: unknown[] }).data;
    for (const pages of [
      [docs.slice(0, 50), docs.slice(50)],
      [docs.filter((_, i) => i % 2), docs.filter((_, i) => !(i % 2))],
    ]) {
      const { set: merged, warnings } = parseEntryFiles(
        pages.map((data, i) => ({
          name: `page-${i}.json`,
          text: JSON.stringify({ data, meta: { total_doc: docs.length } }),
        })),
      );
      expect(warnings).toEqual([]);
      const energies = new Map(set.entries.map((e) => [e.id, e.energyPerAtom]));
      for (const e of merged.entries)
        expect(e.energyPerAtom, e.id).toBeCloseTo(energies.get(e.id)!, 9);
      const p = computeProfile({ entries: merged.entries, formula: "Li6PS5Cl", ion: "Li" });
      expect(p.eAboveHull).toBeCloseTo(0.0829463, 6);
      expect(regionReaction(p, p.regions.at(-1)!)).toBe("Li6PS5Cl + 8 Li → 5 Li2S + Li3P + LiCl");
    }
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
