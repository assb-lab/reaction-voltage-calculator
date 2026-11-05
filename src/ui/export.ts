import { numAtoms } from "../core/formula";
import { volumeForRegion } from "../core/volume";
import { regionReaction, type Profile, type Region } from "../core/profile";

/** When provided, append initial-target-referenced solid-volume results to each region. */
export interface VolumeExportOptions {
  gasPhases: string[];
}

function volumeExport(profile: Profile, region: Region, opts: VolumeExportOptions) {
  const result = volumeForRegion(profile, region, opts.gasPhases);
  const perAtom = profile.targetEntry?.volumePerAtom;
  const initial =
    typeof perAtom === "number" && Number.isFinite(perAtom) && perAtom > 0
      ? numAtoms(profile.target) * perAtom
      : null;
  return {
    status: result.kind,
    initial_volume_A3_per_target_formula: initial,
    product_volume_A3_per_target_formula:
      result.kind === "none" ? initial : result.kind === "volume" ? result.productVolume : null,
    initial_volume_change_percent:
      result.kind === "none" ? 0 : result.kind === "volume" ? result.volumeChange * 100 : null,
    missing: result.kind === "unavailable" ? result.missing : [],
    gases:
      result.kind === "volume"
        ? result.gases.map((g) => ({ id: g.entry.id, name: g.entry.name, amount: g.amount }))
        : [],
  };
}

function csvCell(v: string | number): string {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "inf") : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per equilibrium region, from the oxidised to the reduced end. */
export function profileToCsv(profile: Profile, opts?: VolumeExportOptions): string {
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
  const volumeHeaders = [
    "volume_status",
    "initial_volume_A3_per_target_formula",
    "product_volume_A3_per_target_formula",
    "initial_volume_change_percent",
    "missing_volume_phases",
    "excluded_gases",
  ];
  if (opts) header.push(...volumeHeaders);
  const rows = profile.regions.map((r, i) => [
    i,
    r.vMin,
    r.vMax,
    r.x,
    r.ionAmount,
    r.phases.map((p) => `${p.amount} ${p.entry.name}`).join(" + "),
    r.phases.map((p) => p.entry.id).join(" "),
    regionReaction(profile, r),
    ...(opts
      ? (() => {
          const v = volumeExport(profile, r, opts);
          return [
            v.status,
            v.initial_volume_A3_per_target_formula ?? "",
            v.product_volume_A3_per_target_formula ?? "",
            v.initial_volume_change_percent ?? "",
            v.missing.join("; "),
            v.gases.map((g) => `${g.amount} ${g.name} (${g.id})`).join("; "),
          ];
        })()
      : []),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function profileToJson(profile: Profile, opts?: VolumeExportOptions): string {
  const num = (v: number) => (Number.isFinite(v) ? v : null);
  return JSON.stringify(
    {
      formula: profile.formula,
      ion: profile.ion,
      elements: profile.elements,
      stabilized: profile.stabilized,
      ...(opts
        ? {
            volumeModel: {
              reference: "initial target formula",
              conversionFraction: 1,
              excludeElementalGases: true,
              gasPhases: opts.gasPhases,
              includeWorkingIonReservoir: false,
            },
          }
        : {}),
      eAboveHull: profile.eAboveHull,
      window: profile.window && { ...profile.window, high: num(profile.window.high) },
      plateaus: profile.plateaus,
      regions: profile.regions.map((r) => ({
        vMin: r.vMin,
        vMax: num(r.vMax),
        x: r.x,
        ionAmount: r.ionAmount,
        reaction: regionReaction(profile, r),
        ...(opts ? { volume: volumeExport(profile, r, opts) } : {}),
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
