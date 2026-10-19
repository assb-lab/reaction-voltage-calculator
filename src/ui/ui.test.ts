import { describe, expect, it } from "vite-plus/test";
import { computeProfile } from "../core/profile";
import { demoEntrySet } from "./demo";
import { profileToCsv, profileToJson } from "./export";
import { formulaTspans, renderProfileSvg } from "./plot";

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
    expect((svg.match(/class="box/g) ?? []).length).toBe(profile.regions.length);
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
