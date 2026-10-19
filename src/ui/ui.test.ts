import { describe, expect, it } from "vite-plus/test";
import { atomicFractions, computeProfile } from "../core/profile";
import { demoEntrySet } from "./demo";
import { profileToCsv, profileToJson } from "./export";
import { formulaTspans, renderProfileSvg } from "./plot";
import { idLinkHtml, phaseLinkHtml } from "./html";
import { filmCellHtml, formatChange, formatLengthNm } from "./film";
import { renderVolumeChartSvg, type RegionFilms } from "./volumeChart";
import { displayCoreRatio } from "./particle3d";
import { filmForRegion } from "../core/film";

const profile = computeProfile({ entries: demoEntrySet().entries, formula: "Li6PS5Cl", ion: "Li" });

describe("demo profile", () => {
  it("has an oxidation and a reduction side", () => {
    expect(profile.regions[0].x).toBeCloseTo(-6, 9);
    expect(profile.regions.at(-1)!.x).toBeCloseTo(8, 9);
    expect(profile.window?.targetIsPhase).toBe(true);
  });
});

describe("renderProfileSvg", () => {
  it("renders a standalone SVG with all regions", () => {
    const svg = renderProfileSvg(profile);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('class="window"');
    const cells = profile.regions.reduce((n, r) => n + r.phases.length, 0);
    expect((svg.match(/class="box/g) ?? []).length).toBe(cells);
  });
  it("names the target only on the x axis and in its phase cell, not above the profile", () => {
    const svg = renderProfileSvg(profile);
    const label = formulaTspans(profile.formula);
    expect(svg).toContain(`uptake per ${label}`);
    // x-axis label + the Li6PS5Cl cell of the stability window
    expect(svg.split(label).length - 1).toBe(2);
  });
  it("subscripts numbers in formulas and escapes markup", () => {
    expect(formulaTspans("Li2S")).toContain(">2</tspan>");
    expect(formulaTspans("<x>")).toBe("&lt;x&gt;");
    expect(formulaTspans("0.5 P2S5").startsWith("0.5 P")).toBe(true);
  });
});

describe("exports", () => {
  it("writes one CSV row per region", () => {
    const lines = profileToCsv(profile).trim().split("\n");
    expect(lines).toHaveLength(profile.regions.length + 1);
    expect(lines[1]).toContain("inf");
  });
  it("writes JSON without Infinity", () => {
    const j = JSON.parse(profileToJson(profile));
    expect(j.regions[0].vMax).toBeNull();
    expect(j.window.low).toBeCloseTo(profile.window!.low, 12);
  });
});

describe("HTML escaping", () => {
  it("keeps imported IDs inside their quoted attribute", async () => {
    const { escapeHtml } = await import("./html");
    expect(escapeHtml('"><img src=x onerror="alert(1)">')).toBe(
      "&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
  it("escapes markup while preserving formula subscripts", async () => {
    const { formulaHtml } = await import("./html");
    expect(formulaHtml('Li2S <img src="x">')).toBe("Li<sub>2</sub>S &lt;img src=&quot;x&quot;&gt;");
  });
});

describe("target stability reporting", () => {
  it("does not label a finite decomposition equilibrium interval as target stability", async () => {
    const { parseFormula } = await import("../core/formula");
    const { stabilityWindowText } = await import("./summary");
    const entries = [
      ["Li", 0],
      ["P", 0],
      ["S", 0],
      ["LiS", -1.5],
      ["PS", -1.5],
      ["LiPS2", -1],
    ].map(([name, energy]) => ({
      id: String(name),
      name: String(name),
      composition: parseFormula(String(name)),
      energyPerAtom: Number(energy),
    }));
    const p = computeProfile({ entries, formula: "LiPS2", ion: "Li" });
    expect(p.window?.high).toBeGreaterThan(p.window!.low);
    expect(p.window?.targetIsPhase).toBe(false);
    expect(stabilityWindowText(p)).toBe("なし (分解生成物が安定)");
    expect(renderProfileSvg(p)).not.toContain('class="window"');
  });
  it("marks targets without an entry as unassessed", async () => {
    const { stabilityWindowText } = await import("./summary");
    const p = computeProfile({ entries: demoEntrySet().entries, formula: "Li5PS5Cl", ion: "Li" });
    expect(stabilityWindowText(p)).toBe("評価不可 (該当エントリなし)");
  });
});

describe("phase equilibria grid", () => {
  it("splits each band into cells sized by atomic fraction", () => {
    // Li6PS5Cl + 8 Li -> 5 Li2S + Li3P + LiCl: 15 + 4 + 2 = 21 atoms.
    const last = profile.regions.at(-1)!;
    const fr = atomicFractions(last);
    expect(fr.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const byName = Object.fromEntries(last.phases.map((p, i) => [p.entry.name, fr[i]]));
    expect(byName).toEqual({
      Li2S: expect.closeTo(15 / 21, 12),
      Li3P: expect.closeTo(4 / 21, 12),
      LiCl: expect.closeTo(2 / 21, 12),
    });
    const svg = renderProfileSvg(profile);
    const widths = [
      ...svg.matchAll(
        /<title>(Li2S|Li3P|LiCl): [^<]*0–0\.68 V<\/title>\n<rect class="box red" x="[^"]+" y="[^"]+" width="([^"]+)"/g,
      ),
    ].map((m) => [m[1], Number(m[2])] as const);
    expect(widths).toHaveLength(3);
    const total = widths.reduce((s, [, w]) => s + w, 0);
    for (const [name, w] of widths) expect(w / total).toBeCloseTo(byName[name], 9);
  });
});

describe("phase links", () => {
  it("links MP entries to their materials page and escapes names", () => {
    const html = phaseLinkHtml({ id: "mp-aaacebzk", name: "Li6PS5Cl" });
    expect(html).toContain('href="https://materialsproject.org/materials/mp-985592"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("Li<sub>6</sub>PS<sub>5</sub>Cl");
    expect(phaseLinkHtml({ id: "demo-1", name: "<b>" })).toBe(
      '<span title="demo-1">&lt;b&gt;</span>',
    );
    expect(idLinkHtml("mp-149")).toBe(
      '<a href="https://materialsproject.org/materials/mp-149" target="_blank" rel="noopener noreferrer">mp-149</a>',
    );
    expect(idLinkHtml("virtual")).toBe("virtual");
  });
});

describe("film display", () => {
  it("formats lengths and keeps thin films visible in the 3D model", () => {
    expect(formatLengthNm(1.1934)).toBe("1.19 nm");
    expect(formatLengthNm(88.25)).toBe("88.3 nm");
    expect(formatLengthNm(1534)).toBe("1.53 µm");
    expect(displayCoreRatio(0.997, 0.999)).toEqual({ coreRatio: 0.96, exaggerated: true });
    expect(displayCoreRatio(0.888, 1.065).exaggerated).toBe(false);
    expect(displayCoreRatio(0, 1.2)).toEqual({ coreRatio: 0, exaggerated: false });
    expect(displayCoreRatio(1, 1)).toEqual({ coreRatio: 1, exaggerated: false });
  });

  it("marks regions without volume data and escapes phase names", () => {
    const cell = filmCellHtml({ kind: "unavailable", missing: ["<b>"] });
    expect(cell).toContain("&lt;b&gt;");
    expect(cell).not.toContain("<b>");
    // The demo data has no volumes: every decomposed region is "not available".
    const region = profile.regions.at(-1)!;
    expect(filmForRegion(profile, region, { diameterUm: 1, fraction: 0.1 }).kind).toBe(
      "unavailable",
    );
  });
});

describe("volume change display", () => {
  it("formats signed changes", () => {
    expect(formatChange(0.174)).toBe("+17.4 %");
    expect(formatChange(-0.2871)).toBe("−28.7 %");
    expect(formatChange(0.0001)).toBe("±0 %");
  });

  it("charts one clickable level per region with a film, escaping labels", () => {
    const films: RegionFilms = profile.regions.map((r, i) => ({
      region: i,
      film:
        r.phases.length === 1 && r.phases[0].entry === profile.targetEntry
          ? { kind: "none" }
          : {
              kind: "film",
              thicknessNm: 10,
              coreDiameterUm: 0.9,
              outerDiameterUm: 1,
              volumeRatio: 1 + i / 10,
              volumeChange: i / 10,
              particleVolumeChange: i / 100,
              diameterChange: 0,
              fullyDecomposed: false,
              phases: [],
              gases: [],
              capacityMAhG: null,
            },
    }));
    const svg = renderVolumeChartSvg(profile, films, 2, 'a "chart"');
    expect(svg).toContain('aria-label="a &quot;chart&quot;"');
    expect((svg.match(/data-region="/g) ?? []).length).toBe(profile.regions.length);
    expect((svg.match(/ selected"/g) ?? []).length).toBe(1);
  });
});
