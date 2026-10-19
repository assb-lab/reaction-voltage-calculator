import { regionReaction, type Profile } from "../core/profile";

function csvCell(v: string | number): string {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "inf") : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per equilibrium region, from the oxidised to the reduced end. */
export function profileToCsv(profile: Profile): string {
  const header = [
    "region",
    "V_min",
    "V_max",
    "x_uptake",
    "ion_per_formula",
    "phases",
    "phase_ids",
    "reaction",
  ];
  const rows = profile.regions.map((r, i) => [
    i,
    r.vMin,
    r.vMax,
    r.x,
    r.ionAmount,
    r.phases.map((p) => `${p.amount} ${p.entry.name}`).join(" + "),
    r.phases.map((p) => p.entry.id).join(" "),
    regionReaction(profile, r),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function profileToJson(profile: Profile): string {
  const num = (v: number) => (Number.isFinite(v) ? v : null);
  return JSON.stringify(
    {
      formula: profile.formula,
      ion: profile.ion,
      elements: profile.elements,
      stabilized: profile.stabilized,
      eAboveHull: profile.eAboveHull,
      window: profile.window && { ...profile.window, high: num(profile.window.high) },
      plateaus: profile.plateaus,
      regions: profile.regions.map((r) => ({
        vMin: r.vMin,
        vMax: num(r.vMax),
        x: r.x,
        ionAmount: r.ionAmount,
        reaction: regionReaction(profile, r),
        phases: r.phases.map((p) => ({ id: p.entry.id, name: p.entry.name, amount: p.amount })),
      })),
    },
    null,
    2,
  );
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
