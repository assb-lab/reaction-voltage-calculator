import { describe, expect, it } from "vite-plus/test";
import { computeProfile } from "../core/profile";
import { demoEntrySet } from "./demo";
import { defaultView, LAYOUT, renderProfileSvg, scales } from "./plot";
import { hitRegion, hitTest, regionAt, tooltipHtml } from "./tooltip";

const profile = computeProfile({ entries: demoEntrySet().entries, formula: "Li6PS5Cl", ion: "Li" });
const view = defaultView(profile);
const s = scales(view);
const last = profile.regions.length - 1;

describe("hitTest", () => {
  it("finds the region under the pointer in the profile panel", () => {
    const h = hitTest(profile, view, s.X(-3), s.Y(2));
    expect(h).toMatchObject({ kind: "region", region: regionAt(profile, 2) });
    expect(profile.regions[regionAt(profile, 2)].phases.map((p) => p.entry.name)).toEqual([
      "Li6PS5Cl",
    ]);
  });

  it("snaps to a plateau line", () => {
    const p = profile.plateaus.find((q) => q.xStart >= 0)!;
    const h = hitTest(profile, view, s.X((p.xStart + p.xEnd) / 2), s.Y(p.voltage) + 2);
    expect(h).toEqual({ kind: "plateau", plateau: profile.plateaus.indexOf(p) });
    expect(hitRegion(profile, h!)).toBe(p.region);
  });

  it("picks the phase cell by atomic fraction", () => {
    // Lowest band: 5 Li2S (15 atoms) + Li3P (4) + LiCl (2), alphabetical order Li2S, Li3P, LiCl.
    const y = s.Y(0.3);
    const w = LAYOUT.phaseR - LAYOUT.phaseL;
    const at = (t: number) => hitTest(profile, view, LAYOUT.phaseL + w * t, y);
    expect(at(0.5)).toMatchObject({ kind: "cell", region: last, phase: 0 });
    expect(at(15 / 21 + 0.05)).toMatchObject({ kind: "cell", region: last, phase: 1 });
    expect(at(0.99)).toMatchObject({ kind: "cell", region: last, phase: 2 });
  });

  it("ignores the margins", () => {
    expect(hitTest(profile, view, 5, s.Y(1))).toBeNull();
    expect(hitTest(profile, view, s.X(0), LAYOUT.bottom + 10)).toBeNull();
  });
});

describe("tooltipHtml", () => {
  it("describes regions, plateaus and cells", () => {
    const region = tooltipHtml(profile, { kind: "region", region: last, voltage: 0.3 });
    expect(region).toContain("0.300 V");
    expect(region).toContain("71.4 at.%"); // Li2S 15/21
    expect(region).toContain("Li<sub>6</sub>PS<sub>5</sub>Cl + 8 Li →");
    const p = profile.plateaus.length - 1;
    expect(tooltipHtml(profile, { kind: "plateau", plateau: p })).toMatch(/プラトー 0\.680 V/);
    const cell = tooltipHtml(profile, { kind: "cell", region: last, phase: 0, voltage: 0.3 });
    expect(cell).toContain("Li<sub>2</sub>S");
    expect(cell).toContain("demo-");
  });

  it("escapes entry ids and names", () => {
    const evil = computeProfile({
      entries: demoEntrySet().entries.map((e) =>
        e.name === "Li2S" ? { ...e, id: '<img src=x onerror="1">' } : e,
      ),
      formula: "Li6PS5Cl",
      ion: "Li",
    });
    const html = tooltipHtml(evil, { kind: "cell", region: last, phase: 0, voltage: 0.3 });
    expect(html).not.toContain("<img");
  });
});

describe("highlight rendering", () => {
  it("outlines the highlighted band and cell and omits native titles when asked", () => {
    const svg = renderProfileSvg(profile, view, {
      highlight: last,
      highlightPhase: 1,
      titles: false,
    });
    expect((svg.match(/class="hl"/g) ?? []).length).toBe(2);
    expect(svg).toContain('class="hl-seg"');
    expect(svg).not.toContain("<title>");
  });
});
