import { afterEach, expect, it, vi } from "vite-plus/test";
import { mountParticle } from "./particle3d";

afterEach(() => vi.unstubAllGlobals());

it("draws an entirely unreacted particle without product-colored surface pixels", () => {
  let draw: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    draw = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("devicePixelRatio", 1);
  let pixels: Uint8ClampedArray = new Uint8ClampedArray();
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 48,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => (pixels = image.data),
    }),
  } as unknown as HTMLCanvasElement;
  const particle = mountParticle(canvas, {
    coreRatio: 1,
    phases: [{ color: "#0000ff", volFraction: 1 }],
  });
  draw!(0);
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    visible++;
    // The core is warm gray; any blue-dominant pixel would be a fictitious product layer.
    expect(pixels[i + 2]).toBeLessThanOrEqual(pixels[i]);
  }
  expect(visible).toBeGreaterThan(0);
  particle.update({ coreRatio: 0.8, phases: [{ color: "#0000ff", volFraction: 1 }] });
  draw!(0);
  expect(pixels.some((value, i) => i % 4 === 2 && value > pixels[i - 2])).toBe(true);
  particle.destroy();
});
