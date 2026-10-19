import type { Profile } from "../core/profile";
import { defaultView, LAYOUT, renderProfileSvg, scales, type View } from "./plot";

const MIN_V_SPAN = 1e-3;
const MAX_V_SPAN = 100;
const MIN_X_SPAN = 1e-2;
const MAX_X_SPAN = 1e4;

/** Zoom the interval [lo, hi] by `factor` (< 1 zooms in) keeping `center` fixed. */
export function zoomAround(
  lo: number,
  hi: number,
  center: number,
  factor: number,
  minSpan: number,
  maxSpan: number,
): [number, number] {
  const span = Math.min(Math.max((hi - lo) * factor, minSpan), maxSpan);
  const t = hi > lo ? (center - lo) / (hi - lo) : 0.5;
  return [center - t * span, center + (1 - t) * span];
}

export function zoomVoltage(view: View, center: number, factor: number): View {
  const [vMin, vMax] = zoomAround(view.vMin, view.vMax, center, factor, MIN_V_SPAN, MAX_V_SPAN);
  return { ...view, vMin, vMax };
}

export function zoomX(view: View, center: number, factor: number): View {
  const [xMin, xMax] = zoomAround(view.xMin, view.xMax, center, factor, MIN_X_SPAN, MAX_X_SPAN);
  return { ...view, xMin, xMax };
}

/** Shift the view by data-space offsets. */
export function panView(view: View, dv: number, dx: number): View {
  return {
    vMin: view.vMin + dv,
    vMax: view.vMax + dv,
    xMin: view.xMin + dx,
    xMax: view.xMax + dx,
  };
}

/** Voltage range from user input; returns null when invalid. */
export function voltageRange(min: number, max: number): [number, number] | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < MIN_V_SPAN) return null;
  return [min, max];
}

export interface Chart {
  view(): View;
  setView(view: View): void;
  reset(): void;
  destroy(): void;
}

/**
 * Render the figure into `container` and make it interactive:
 * wheel = zoom voltage (Shift+wheel or wheel over the x axis = zoom x), mouse drag = pan,
 * two-finger pinch = zoom voltage, double click = reset, keyboard: +/- arrows 0.
 */
export function mountChart(
  container: HTMLElement,
  profile: Profile,
  onChange?: (view: View) => void,
): Chart {
  const initial = defaultView(profile);
  let view = initial;
  let frame = 0;

  const draw = () => {
    frame = 0;
    container.innerHTML = renderProfileSvg(profile, view, { idPrefix: "rvc-live" });
  };
  const update = (next: View) => {
    view = next;
    onChange?.(view);
    if (!frame) frame = requestAnimationFrame(draw);
  };

  /** Pointer position in SVG user units. */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = container.querySelector("svg");
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const inProfileX = (px: number) => px >= LAYOUT.profileL && px <= LAYOUT.profileR;

  const onWheel = (ev: WheelEvent) => {
    const p = toSvg(ev.clientX, ev.clientY);
    if (!p) return;
    ev.preventDefault();
    const factor = Math.exp(Math.sign(ev.deltaY) * Math.min(Math.abs(ev.deltaY), 100) * 0.0015);
    const s = scales(view);
    if ((ev.shiftKey || p.y > LAYOUT.bottom) && inProfileX(p.x))
      update(zoomX(view, s.xAt(p.x), factor));
    else
      update(zoomVoltage(view, s.vAt(Math.min(Math.max(p.y, LAYOUT.top), LAYOUT.bottom)), factor));
  };

  // Mouse/pen drag pans; touch pinch zooms the voltage axis (one-finger touch keeps page scrolling).
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; view: View; profile: boolean } | null = null;
  let pinch: { dist: number; view: View; center: number } | null = null;

  const onPointerDown = (ev: PointerEvent) => {
    const p = toSvg(ev.clientX, ev.clientY);
    if (!p) return;
    pointers.set(ev.pointerId, p);
    if (ev.pointerType !== "touch" && ev.button === 0) {
      drag = { ...p, view, profile: inProfileX(p.x) };
      container.setPointerCapture(ev.pointerId);
      container.classList.add("dragging");
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.max(Math.abs(a.y - b.y), 10),
        view,
        center: scales(view).vAt((a.y + b.y) / 2),
      };
    }
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!pointers.has(ev.pointerId)) return;
    const p = toSvg(ev.clientX, ev.clientY);
    if (!p) return;
    pointers.set(ev.pointerId, p);
    if (drag) {
      const s = scales(drag.view);
      const dv = s.vAt(drag.y) - s.vAt(p.y);
      const dx = drag.profile ? s.xAt(drag.x) - s.xAt(p.x) : 0;
      update(panView(drag.view, dv, dx));
    } else if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.max(Math.abs(a.y - b.y), 10);
      update(zoomVoltage(pinch.view, pinch.center, pinch.dist / dist));
    }
  };
  const onPointerUp = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag) {
      drag = null;
      container.classList.remove("dragging");
    }
  };
  const onDblClick = () => update(initial);
  const onKey = (ev: KeyboardEvent) => {
    const mid = (view.vMin + view.vMax) / 2;
    const step = (view.vMax - view.vMin) * 0.1;
    const xStep = (view.xMax - view.xMin) * 0.1;
    const actions: Record<string, () => View> = {
      "+": () => zoomVoltage(view, mid, 0.8),
      "=": () => zoomVoltage(view, mid, 0.8),
      "-": () => zoomVoltage(view, mid, 1.25),
      ArrowUp: () => panView(view, step, 0),
      ArrowDown: () => panView(view, -step, 0),
      ArrowLeft: () => panView(view, 0, -xStep),
      ArrowRight: () => panView(view, 0, xStep),
      "0": () => initial,
    };
    const act = actions[ev.key];
    if (!act) return;
    ev.preventDefault();
    update(act());
  };

  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  container.addEventListener("dblclick", onDblClick);
  container.addEventListener("keydown", onKey);
  container.classList.add("interactive");
  container.tabIndex = 0;
  draw();
  onChange?.(view);

  return {
    view: () => view,
    setView: update,
    reset: () => update(initial),
    destroy: () => {
      if (frame) cancelAnimationFrame(frame);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("dblclick", onDblClick);
      container.removeEventListener("keydown", onKey);
      container.classList.remove("interactive", "dragging");
    },
  };
}
