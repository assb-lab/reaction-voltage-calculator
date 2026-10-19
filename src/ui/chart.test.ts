import { describe, expect, it } from "vite-plus/test";
import { computeProfile } from "../core/profile";
import { panView, voltageRange, zoomAround, zoomVoltage, zoomX } from "./chart";
import { demoEntrySet } from "./demo";
import { defaultView, LAYOUT, renderProfileSvg, scales, ticks } from "./plot";

const profile = computeProfile({ entries: demoEntrySet().entries, formula: "Li6PS5Cl", ion: "Li" });

describe("view math", () => {
  it("zooms around a fixed point", () => {
    expect(zoomAround(0, 4, 1, 0.5, 1e-3, 100)).toEqual([0.5, 2.5]);
    expect(zoomAround(0, 4, 1, 2, 1e-3, 100)).toEqual([-1, 7]);
    // Span limits.
    expect(zoomAround(0, 4, 2, 1e-9, 1e-3, 100)).toEqual([1.9995, 2.0005]);
  });

  it("keeps the other axis when zooming one", () => {
    const v = defaultView(profile);
    const z = zoomVoltage(v, 2, 0.5);
    expect([z.xMin, z.xMax]).toEqual([v.xMin, v.xMax]);
    const zx = zoomX(v, 0, 0.5);
    expect([zx.vMin, zx.vMax]).toEqual([v.vMin, v.vMax]);
  });

  it("pans and validates ranges", () => {
    expect(panView({ vMin: 0, vMax: 4, xMin: -6, xMax: 8 }, 1, -2)).toEqual({
      vMin: 1,
      vMax: 5,
      xMin: -8,
      xMax: 6,
    });
    expect(voltageRange(1.5, 2.5)).toEqual([1.5, 2.5]);
    expect(voltageRange(2, 1)).toBeNull();
    expect(voltageRange(Number.NaN, 1)).toBeNull();
    expect(voltageRange(-1e308, 1e308)).toBeNull();
    expect(voltageRange(0, 101)).toBeNull();
    expect(voltageRange(1e20, 1e20 + 16384)).toBeNull();
  });

  it("maps data to SVG and back", () => {
    const v = defaultView(profile);
    const s = scales(v);
    expect(s.vAt(s.Y(1.234))).toBeCloseTo(1.234, 9);
    expect(s.xAt(s.X(-3.5))).toBeCloseTo(-3.5, 9);
    expect(s.Y(v.vMax)).toBeCloseTo(LAYOUT.top, 9);
    expect(Number.isFinite(s.Y(Infinity))).toBe(true);
  });
});

describe("rendering a view", () => {
  it("bounds tick generation when floating-point additions cannot advance", () => {
    const large = ticks(1e20, 1e20 + 16384, 6);
    expect(large.length).toBeGreaterThan(0);
    expect(large.length).toBeLessThanOrEqual(102);
    expect(new Set(large).size).toBe(large.length);
    expect(ticks(0, 1, Infinity)).toEqual([]);
    expect(ticks(0, 1, 0)).toEqual([]);
    expect(ticks(0, Infinity, 6)).toEqual([]);
    expect(ticks(1, 1, 6)).toEqual([]);
    expect(ticks(0, 1, 1e9).length).toBeLessThanOrEqual(102);
    expect(ticks(0, 0.6, 6)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  });
  it("mirrors inward ticks on all four sides", () => {
    const view = defaultView(profile);
    const svg = renderProfileSvg(profile, view);
    const nV = ticks(view.vMin, view.vMax, 6).length;
    const nX = ticks(view.xMin, view.xMax, 7).length;
    const tickLines = [...svg.matchAll(/<line class="axis"[^>]*>/g)].length;
    // Voltage ticks on both sides of both panels, x ticks on top and bottom.
    expect(tickLines).toBe(nV * 4 + nX * 2);
  });

  it("clips content to the zoomed range and follows the view", () => {
    const view = { ...defaultView(profile), vMin: 1.5, vMax: 2.5 };
    const svg = renderProfileSvg(profile, view, { idPrefix: "t" });
    expect(svg).toContain('clip-path="url(#t-clip-profile)"');
    expect(svg).toContain('clip-path="url(#t-clip-phase)"');
    // Bands outside 1.5-2.5 V are skipped; the target band (1.554-2.24 V) is drawn.
    expect(svg).toContain("Li6PS5Cl: 100 at.%");
    expect(svg).not.toContain("P2S5: ");
    for (const t of ticks(1.5, 2.5, 6)) expect(svg).toContain(`>${t}</text>`);
  });
});
