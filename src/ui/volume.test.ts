import { describe, expect, it } from "vite-plus/test";
import { computeProfile } from "../core/profile";
import { volumeForRegion } from "../core/volume";
import { demoEntrySet } from "./demo";
import { volumeCellHtml } from "./volume";
import { profileToCsv, profileToJson } from "./export";
import { volumeTooltipHtml } from "./volumeInteraction";
import { renderVolumeChartSvg, volumeRange } from "./volumeChart";

const p = computeProfile({
  entries: demoEntrySet().entries.map((e) => ({ ...e, volumePerAtom: 15 })),
  formula: "Li6PS5Cl",
  ion: "Li",
});
const opts = { gasPhases: ["LiCl"] };

describe("volume expansion output", () => {
  it("exports percent, initial and product volumes, model and excluded gas amounts", () => {
    const j = JSON.parse(profileToJson(p, opts));
    const unchanged = j.regions.find(
      (r: { volume: { status: string } }) => r.volume.status === "none",
    ).volume;
    expect(unchanged.initial_volume_change_percent).toBe(0);
    expect(unchanged.initial_volume_A3_per_target_formula).toBe(195);
    expect(unchanged.product_volume_A3_per_target_formula).toBe(195);
    const v = j.regions.at(-1).volume;
    // Li6PS5Cl (13 atoms) -> 5 Li2S + Li3P (19 solid atoms), with LiCl released.
    expect(v.initial_volume_A3_per_target_formula).toBe(195);
    expect(v.product_volume_A3_per_target_formula).toBe(285);
    expect(v.initial_volume_change_percent).toBeCloseTo(100 * (285 / 195 - 1), 9);
    expect(v.gases).toMatchObject([{ name: "LiCl", amount: 1 }]);
    expect(j.volumeModel.gasPhases).toEqual(["LiCl"]);
    expect(j.volumeModel.reference).toBe("initial target formula");
    const csv = profileToCsv(p, opts);
    expect(csv).toContain("initial_volume_change_percent");
    expect(csv).toContain(",195,285,");
    expect(csv.trim().split("\n")).toHaveLength(p.regions.length + 1);
  });

  it("keeps legacy exports when mode is off and preserves missing values rather than zero", () => {
    expect(profileToCsv(p)).not.toContain("initial_volume_change_percent");
    expect(JSON.parse(profileToJson(p)).regions[0].volume).toBeUndefined();
    const missing = computeProfile({
      entries: demoEntrySet().entries,
      formula: p.formula,
      ion: p.ion,
    });
    const v = JSON.parse(profileToJson(missing, opts)).regions.at(-1).volume;
    expect(v.status).toBe("unavailable");
    expect(v.initial_volume_change_percent).toBeNull();
    expect(v.missing).toContain("Li2S");
  });

  it("escapes missing labels, distinguishes unchanged targets, and reports released gases", () => {
    expect(volumeCellHtml({ kind: "unavailable", missing: ["<script>"] })).toContain(
      "&lt;script&gt;",
    );
    expect(volumeCellHtml({ kind: "none" })).toContain("±0 %");
    const html = volumeCellHtml(volumeForRegion(p, p.regions.at(-1)!, opts.gasPhases));
    expect(html).toContain("+46.2 %");
    expect(html).toContain("LiCl (1 mol/mol)");
  });

  it("pads both sides by 10%, including below zero for expansion-only data", () => {
    expect(volumeRange([0, 20])).toEqual([-2, 22]);
    expect(volumeRange([-40, 20])).toEqual([-46, 26]);
    expect(volumeRange([-100])).toEqual([-110, 10]);
    expect(volumeRange([0])).toEqual([-5, 5]);
    expect(volumeRange([])).toEqual([-5, 5]);
  });

  it("shows volume, phases and the reaction in the same tooltip as the voltage chart", () => {
    const region = p.regions.length - 1;
    const html = volumeTooltipHtml(
      p,
      region,
      volumeForRegion(p, p.regions[region], opts.gasPhases),
      0.3,
    );
    expect(html).toContain("0.300 V");
    expect(html).toContain("+46.2 %");
    expect(html).toContain("195");
    expect(html).toContain("285");
    expect(html).toContain("LiCl (1 mol/mol)");
    expect(html).toContain('class="rxn"');
    expect(html).toContain("Li<sub>2</sub>S");
  });

  it("charts standalone volume results, leaves gaps for missing regions and embeds export styles", () => {
    const levels = p.regions.map((r, region) => ({ region, film: volumeForRegion(p, r) }));
    levels[0].film = { kind: "unavailable", missing: ["S"] };
    const svg = renderVolumeChartSvg(p, levels, null, 'volume "plot"', {
      voltage: "電位 (V)",
      change: "膨張率 (%)",
    });
    expect(svg).toContain('viewBox="0 0 780 460"');
    expect(svg).not.toContain('data-region="0"');
    expect(svg).toContain('aria-label="volume &quot;plot&quot;"');
    expect(svg).toContain("膨張率 (%)");
    expect(svg).toContain("<style>");
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});
