import type { Profile } from "../core/profile";
import { tooltipHtml } from "./tooltip";
import { volumeCellHtml } from "./volume";
import { filmCellHtml } from "./film";
import { voltageTop } from "./plot";
import { VOLUME_LAYOUT, type RegionFilms } from "./volumeChart";

/** Reuse the reaction-profile tooltip, adding the exact volume/film result shown in the table. */
export function volumeTooltipHtml(
  profile: Profile,
  region: number,
  result: RegionFilms[number]["film"],
  voltage: number,
): string {
  const detail =
    result.kind === "film" || result.kind === "chargeless"
      ? filmCellHtml(result)
      : volumeCellHtml(result);
  return `${tooltipHtml(profile, { kind: "region", region, voltage })}<div>${detail}</div>`;
}

/** Bind once per rendered SVG; dispose before replacing it so tooltips and listeners cannot linger. */
export function mountVolumeInteraction(
  container: HTMLElement,
  profile: Profile,
  films: RegionFilms,
): () => void {
  const tip = document.createElement("div");
  tip.className = "chart-tooltip volume-tooltip";
  tip.setAttribute("role", "status");
  tip.setAttribute("aria-live", "polite");
  tip.hidden = true;
  container.after(tip);
  const svg = container.querySelector("svg")!;
  const L = VOLUME_LAYOUT;
  const available = films.filter(
    ({ film }) => film.kind === "none" || film.kind === "volume" || film.kind === "film",
  );
  let active: number | null = null;
  const hide = () => {
    tip.hidden = true;
    active = null;
    container.querySelectorAll(".hovered").forEach((g) => g.classList.remove("hovered"));
  };
  const show = (region: number, voltage: number, at: { x: number; y: number }) => {
    const result = available.find((f) => f.region === region);
    if (!result) {
      hide();
      return;
    }
    hide();
    active = region;
    container.querySelector(`[data-region="${region}"]`)?.classList.add("hovered");
    tip.innerHTML = volumeTooltipHtml(profile, region, result.film, voltage);
    tip.hidden = false;
    const { width, height } = tip.getBoundingClientRect();
    const left = at.x + 14 + width > innerWidth ? at.x - 14 - width : at.x + 14;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, Math.min(at.y - height / 2, innerHeight - height - 4))}px`;
  };
  const atPointer = (ev: PointerEvent) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const point = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    if (
      point.x < L.left ||
      point.x > L.W - L.right ||
      point.y < L.top ||
      point.y > L.H - L.bottom
    ) {
      hide();
      return;
    }
    const voltage = ((point.x - L.left) / (L.W - L.left - L.right)) * voltageTop(profile);
    const region = profile.regions.findIndex((r) => voltage >= r.vMin && voltage < r.vMax);
    show(region, voltage, { x: ev.clientX, y: ev.clientY });
  };
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") atPointer(ev);
  };
  const onLeave = (ev: PointerEvent) => {
    // A touch pointer leaves immediately after pointerup; keep its tapped detail visible.
    if (ev.pointerType !== "touch") hide();
  };
  const onOutside = (ev: PointerEvent) => {
    if (!container.contains(ev.target as Node)) hide();
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") atPointer(ev);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      hide();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key) || !available.length) return;
    ev.preventDefault();
    const current = available.findIndex((f) => f.region === active);
    const next =
      ev.key === "Home"
        ? 0
        : ev.key === "End"
          ? available.length - 1
          : current < 0
            ? ev.key === "ArrowRight"
              ? 0
              : available.length - 1
            : (current + (ev.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
    const region = available[next].region;
    const r = profile.regions[region];
    const voltage = (r.vMin + Math.min(voltageTop(profile), r.vMax)) / 2;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const at = new DOMPoint(
      L.left + (voltage / voltageTop(profile)) * (L.W - L.left - L.right),
      (L.top + L.H - L.bottom) / 2,
    ).matrixTransform(ctm);
    show(region, voltage, at);
  };
  container.tabIndex = 0;
  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerup", onUp);
  container.addEventListener("pointerleave", onLeave);
  container.addEventListener("keydown", onKey);
  container.addEventListener("blur", hide);
  document.addEventListener("pointerdown", onOutside);
  // Scrolling/resizing changes the anchor's viewport position; dismiss the fixed tooltip.
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  return () => {
    hide();
    tip.remove();
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerup", onUp);
    container.removeEventListener("pointerleave", onLeave);
    container.removeEventListener("keydown", onKey);
    container.removeEventListener("blur", hide);
    document.removeEventListener("pointerdown", onOutside);
    window.removeEventListener("scroll", hide, true);
    window.removeEventListener("resize", hide);
  };
}
