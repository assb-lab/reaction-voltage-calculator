import type { Profile } from "../core/profile";
import { defaultView, LAYOUT, renderProfileSvg, scales, type View } from "./plot";
import { hitRegion, hitTest, tooltipHtml, type Hit } from "./tooltip";

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
  const span = max - min;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(span) ||
    span < MIN_V_SPAN ||
    span > MAX_V_SPAN
  )
    return null;
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
 * Hover (or tap, or [ ] / PageUp PageDown on the focused figure) shows a tooltip and highlights
 * the equilibrium region in both panels.
 */
export function mountChart(
  container: HTMLElement,
  profile: Profile,
  onChange?: (view: View) => void,
): Chart {
  const initial = defaultView(profile);
  let view = initial;
  let frame = 0;
  let hit: Hit | null = null;

  const tip = document.createElement("div");
  tip.className = "chart-tooltip";
  tip.setAttribute("role", "status");
  tip.setAttribute("aria-live", "polite");
  tip.hidden = true;
  container.after(tip);

  const draw = () => {
    frame = 0;
    container.innerHTML = renderProfileSvg(profile, view, {
      idPrefix: "rvc-live",
      titles: false,
      highlight: hit ? hitRegion(profile, hit) : null,
      highlightPhase: hit?.kind === "cell" ? hit.phase : null,
    });
  };
  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  /** Show the tooltip for `next` near a viewport point (or hide it). */
  const setHit = (next: Hit | null, at?: { x: number; y: number }) => {
    const key = (h: Hit | null) => (h ? JSON.stringify({ ...h, voltage: undefined }) : "");
    const changed = key(next) !== key(hit) || next?.kind === "region";
    hit = next;
    if (!next || !at) {
      tip.hidden = true;
      if (changed) redraw();
      return;
    }
    if (changed) {
      tip.innerHTML = tooltipHtml(profile, next);
      redraw();
    }
    tip.hidden = false;
    const pad = 14;
    const { width, height } = tip.getBoundingClientRect();
    const left = at.x + pad + width > innerWidth ? at.x - pad - width : at.x + pad;
    const top = Math.min(Math.max(at.y - height / 2, 4), innerHeight - height - 4);
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${top}px`;
  };

  /** Viewport point of an SVG point. */
  const toClient = (x: number, y: number) => {
    const ctm = container.querySelector("svg")?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };
  const update = (next: View) => {
    view = next;
    onChange?.(view);
    redraw();
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

  let tap: { x: number; y: number } | null = null;

  const onPointerDown = (ev: PointerEvent) => {
    const p = toSvg(ev.clientX, ev.clientY);
    if (!p) return;
    pointers.set(ev.pointerId, p);
    tap =
      ev.pointerType === "touch" && pointers.size === 1 ? { x: ev.clientX, y: ev.clientY } : null;
    if (ev.pointerType !== "touch" && ev.button === 0) {
      setHit(null);
      drag = { ...p, view, profile: inProfileX(p.x) };
      container.setPointerCapture(ev.pointerId);
      container.classList.add("dragging");
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 10),
        view,
        center: scales(view).vAt((a.y + b.y) / 2),
      };
    }
  };
  const onPointerMove = (ev: PointerEvent) => {
    const p = toSvg(ev.clientX, ev.clientY);
    if (!p) return;
    if (!pointers.has(ev.pointerId)) {
      // Plain hover (mouse/pen without a pressed button).
      if (ev.pointerType !== "touch")
        setHit(hitTest(profile, view, p.x, p.y), { x: ev.clientX, y: ev.clientY });
      return;
    }
    pointers.set(ev.pointerId, p);
    if (tap && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > 8) tap = null;
    if (drag) {
      const s = scales(drag.view);
      const dv = s.vAt(drag.y) - s.vAt(p.y);
      const dx = drag.profile ? s.xAt(drag.x) - s.xAt(p.x) : 0;
      update(panView(drag.view, dv, dx));
    } else if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 10);
      update(zoomVoltage(pinch.view, pinch.center, pinch.dist / dist));
    }
  };
  const onPointerUp = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    if (tap && ev.pointerType === "touch") {
      const p = toSvg(ev.clientX, ev.clientY);
      if (p) setHit(hitTest(profile, view, p.x, p.y), { x: ev.clientX, y: ev.clientY });
      tap = null;
    }
    if (pointers.size < 2) pinch = null;
    if (drag) {
      drag = null;
      container.classList.remove("dragging");
    }
  };
  const onLeave = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch" && !drag) setHit(null);
  };
  const onOutside = (ev: PointerEvent) => {
    if (!container.contains(ev.target as Node) && !tip.contains(ev.target as Node)) setHit(null);
  };
  const onBlur = () => setHit(null);
  const onDblClick = () => update(initial);

  /** Keyboard: step the highlighted region and anchor the tooltip on its phase band. */
  const stepRegion = (delta: number) => {
    const n = profile.regions.length;
    const cur = hit ? hitRegion(profile, hit) : delta > 0 ? -1 : n;
    const region = Math.min(Math.max(cur + delta, 0), n - 1);
    const r = profile.regions[region];
    const s = scales(view);
    const vis = (v: number) => Math.min(Math.max(v, view.vMin), view.vMax);
    const v = (vis(r.vMin) + vis(r.vMax)) / 2;
    setHit({ kind: "region", region, voltage: v }, toClient(LAYOUT.phaseR, s.Y(v)));
  };
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
    if (ev.key === "]" || ev.key === "PageDown") {
      ev.preventDefault();
      return stepRegion(1);
    }
    if (ev.key === "[" || ev.key === "PageUp") {
      ev.preventDefault();
      return stepRegion(-1);
    }
    if (ev.key === "Escape") return setHit(null);
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
  container.addEventListener("pointerleave", onLeave);
  container.addEventListener("blur", onBlur);
  document.addEventListener("pointerdown", onOutside);
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
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerdown", onOutside);
      container.classList.remove("interactive", "dragging");
      tip.remove();
    },
  };
}
