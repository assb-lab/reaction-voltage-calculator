/**
 * Cutaway view of a coated particle, like a textbook drawing of the Earth's interior: a sphere with
 * one octant removed, so the cut faces show the unreacted core and the decomposition film around it.
 * Rendered by per-pixel ray casting (orthographic) on a canvas; no 3D library needed.
 */

/** Categorical colors for film phases (readable on light and dark backgrounds). */
export const PHASE_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#b07aa1",
  "#edc948",
  "#76b7b2",
  "#9c755f",
];
export const CORE_COLOR = "#b9b4aa";

export interface ParticleModel {
  /** Core radius / outer radius (0–1) as drawn. */
  coreRatio: number;
  /** Film phases with their volume fractions (summing to 1) and colors. */
  phases: { color: string; volFraction: number }[];
}

export interface ParticleView {
  update(model: ParticleModel): void;
  destroy(): void;
}

type Vec = [number, number, number];
type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Deterministic hash of an integer lattice point to [0, 1). */
function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Grains of the film: each lattice cell holds one phase, chosen with the volume fractions. */
const GRAIN = 32;

/** Object-space rotation for a yaw (about y) then pitch (about x); rows map view -> object. */
function rotation(yaw: number, pitch: number): [Vec, Vec, Vec] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // object = Ry(yaw)^T · Rx(pitch)^T · view
  return [
    [cy, sy * sp, -sy * cp],
    [0, cp, sp],
    [sy, -cy * sp, cy * cp],
  ];
}

const apply = (m: [Vec, Vec, Vec], v: Vec): Vec => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

/** Light direction in view space (upper left, towards the viewer). */
const LIGHT: Vec = (() => {
  const l: Vec = [-0.45, 0.55, 0.7];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

export function mountParticle(canvas: HTMLCanvasElement, initial: ParticleModel): ParticleView {
  const ctx = canvas.getContext("2d");
  let model = initial;
  // Default view: the removed octant (x, y, z > 0 in object space) faces the viewer.
  let yaw = -0.7;
  let pitch = 0.5;
  let frame = 0;

  const draw = () => {
    frame = 0;
    if (!ctx) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const css = canvas.clientWidth || 320;
    const size = Math.round(css * dpr);
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const img = ctx.createImageData(size, size);
    const px = img.data;
    const toObject = rotation(yaw, pitch);
    // View direction (into the screen) in object space.
    const d = apply(toObject, [0, 0, -1]);
    const core2 = model.coreRatio ** 2;
    const coreRgb = hexToRgb(CORE_COLOR);
    const cumulative: { rgb: Rgb; upTo: number }[] = [];
    let acc = 0;
    for (const p of model.phases) {
      acc += p.volFraction;
      cumulative.push({ rgb: hexToRgb(p.color), upTo: acc });
    }
    const filmColor = (p: Vec): Rgb => {
      const g = hash3(Math.floor(p[0] * GRAIN), Math.floor(p[1] * GRAIN), Math.floor(p[2] * GRAIN));
      const pick = cumulative.find((c) => g * acc < c.upTo) ?? cumulative.at(-1);
      return pick ? pick.rgb : coreRgb;
    };
    // Face normals of the three cut planes in view space (pointing into the removed octant).
    const faceNormals: Vec[] = [0, 1, 2].map((i) => [
      toObject[i][0],
      toObject[i][1],
      toObject[i][2],
    ]);
    const scale = size * 0.44;
    const c0 = size / 2;

    for (let j = 0; j < size; j++) {
      const v = (c0 - j - 0.5) / scale;
      for (let i = 0; i < size; i++) {
        const u = (i + 0.5 - c0) / scale;
        const rr = u * u + v * v;
        if (rr > 1) continue;
        const zf = Math.sqrt(1 - rr);
        const front = apply(toObject, [u, v, zf]);
        let rgb: Rgb;
        let shade: number;
        if (!(front[0] > 0 && front[1] > 0 && front[2] > 0)) {
          // Outer surface of the film.
          rgb = model.phases.length && model.coreRatio < 1 ? filmColor(front) : coreRgb;
          shade = Math.max(0, u * LIGHT[0] + v * LIGHT[1] + zf * LIGHT[2]);
        } else {
          // Inside the removed octant: find where the ray leaves it through a cut plane.
          let s = Infinity;
          let face = -1;
          for (let k = 0; k < 3; k++) {
            if (d[k] < 0) {
              const sk = front[k] / -d[k];
              if (sk < s) {
                s = sk;
                face = k;
              }
            }
          }
          if (face < 0 || s > 2 * zf) continue; // leaves the sphere first: see-through
          const p: Vec = [front[0] + s * d[0], front[1] + s * d[1], front[2] + s * d[2]];
          const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
          rgb = r2 <= core2 || !model.phases.length ? coreRgb : filmColor(p);
          const n = faceNormals[face];
          shade = 0.55 + 0.45 * Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
          // Thin outline at the core boundary.
          if (
            model.phases.length &&
            model.coreRatio > 0 &&
            Math.abs(Math.sqrt(r2) - model.coreRatio) < 1.2 / scale
          )
            shade *= 0.55;
        }
        const k = 0.3 + 0.7 * shade;
        const o = (j * size + i) * 4;
        px[o] = rgb[0] * k;
        px[o + 1] = rgb[1] * k;
        px[o + 2] = rgb[2] * k;
        px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  };
  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  const clampPitch = (p: number) => Math.max(-1.4, Math.min(1.4, p));
  const onDown = (ev: PointerEvent) => {
    drag = { x: ev.clientX, y: ev.clientY, yaw, pitch };
    canvas.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: PointerEvent) => {
    if (!drag) return;
    yaw = drag.yaw + (ev.clientX - drag.x) * 0.01;
    pitch = clampPitch(drag.pitch + (ev.clientY - drag.y) * 0.01);
    redraw();
  };
  const onUp = () => (drag = null);
  const onKey = (ev: KeyboardEvent) => {
    const step = 0.15;
    if (ev.key === "ArrowLeft") yaw -= step;
    else if (ev.key === "ArrowRight") yaw += step;
    else if (ev.key === "ArrowUp") pitch = clampPitch(pitch - step);
    else if (ev.key === "ArrowDown") pitch = clampPitch(pitch + step);
    else return;
    ev.preventDefault();
    redraw();
  };
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("keydown", onKey);
  redraw();

  return {
    update(next) {
      model = next;
      redraw();
    },
    destroy() {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("keydown", onKey);
    },
  };
}

/**
 * Core ratio to draw: the true r / R_out, but with the film at least `minFilm` of the radius so a
 * very thin film stays visible. `exaggerated` tells the caller to say so.
 */
export function displayCoreRatio(
  coreDiameter: number,
  outerDiameter: number,
  minFilm = 0.04,
): { coreRatio: number; exaggerated: boolean } {
  const ratio = outerDiameter > 0 ? coreDiameter / outerDiameter : 0;
  if (ratio >= 1) return { coreRatio: 1, exaggerated: false };
  return ratio > 1 - minFilm
    ? { coreRatio: 1 - minFilm, exaggerated: true }
    : { coreRatio: ratio, exaggerated: false };
}
