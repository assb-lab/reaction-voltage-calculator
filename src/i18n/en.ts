import type { MessageKey } from "./ja";

/** English messages. Typed against ja.ts so a missing or extra key fails the type check. */
export const en: Record<MessageKey, string> = {
  // Page header and onboarding
  "header.lede":
    "Computes the phase equilibria and reaction voltages (electrochemical stability window) of a composition open to a working ion, from Materials Project energies. Everything runs in your browser.",
  "header.help": "Guide",
  "header.theme": "Theme",
  "header.themeAuto": "Theme: auto",
  "header.themeLight": "Theme: light",
  "header.themeDark": "Theme: dark",
  "header.lang": "Language",
  "onb.title": "Getting started",
  "onb.close": "Close the guide",
  "onb.step1Title": "Get a Materials Project API key",
  "onb.step1":
    'Sign in at <a href="https://materialsproject.org/" target="_blank" rel="noopener noreferrer">materialsproject.org</a> and copy the API key from the account menu. The key is only used for queries to the MP API.',
  "onb.step1Button": "Go to the API key field",
  "onb.step2Title": "Enter a composition and compute",
  "onb.step2":
    "Choose a composition (e.g. Li6PS5Cl) and a working ion, then press “Fetch from MP and compute”. Within the elements already fetched, changing the composition recomputes immediately.",
  "onb.step3Title": "Read the figure",
  "onb.step3":
    "The x axis is the ion uptake per formula unit of the target (x &lt; 0: oxidation, x &gt; 0: reduction). The grey band is the stability window of the target phase; the right panel shows the stable phase assemblage at each voltage.",
  "onb.demo": "Try the demo data",
  "onb.done": "Close",
  "onb.hint": "The demo data uses made-up energies. Reopen this guide from “Guide” at any time.",

  // Form
  "form.formula": "Composition",
  "form.ion": "Working ion",
  "form.data": "Data",
  "form.apiKeyPlaceholder": "From the materialsproject.org dashboard",
  "form.saveKey": "Remember in this browser",
  "form.fetch": "Fetch from MP and compute",
  "form.loadJson": "Load JSON",
  "form.demo": "Demo data",
  "cli.summary": "Fetch with a command (needed on the public site)",
  "cli.intro":
    "The Materials Project API only allows direct browser requests (CORS) from materialsproject.org, so “Fetch from MP” does not work on the public site. Run the command below in a terminal and pick the saved JSON with “Load JSON” (several files can be selected at once).",
  "cli.shell": "Shell",
  "cli.step1": "Put the API key in an environment variable",
  "cli.step2": "Download the data (updates with the composition, working ion and thermo type)",
  "cli.copy": "Copy command",
  "cli.copied": "Copied",
  "cli.copyFailed": "Could not copy",
  "cli.step3Before": "Select the saved",
  "cli.step3After": "with “Load JSON”",
  "cli.hint":
    "Each file holds up to 1000 entries. If entries are missing you get a warning when loading: change <code>_page=1</code> in the URL to 2, 3… and select all files together. When running locally with <code>vp dev</code> / <code>vp preview</code>, “Fetch from MP” works directly through the dev server proxy.",
  "cli.invalidFormula": "(enter a valid composition)",
  "opt.legend": "Options",
  "opt.stabilize": "Place the target on the hull (default)",
  "opt.stabilizeHint":
    "Includes a metastable target phase in the profile. Uncheck to see the equilibria with the original energies. No virtual phase is created for compositions without an entry.",
  "opt.deltaBefore": "Lower by",
  "opt.deltaAfter": "meV/atom below the hull",
  "opt.exclude": "Phases to exclude (comma or newline separated)",
  "opt.excludePlaceholder": "e.g. Li3P7, mp-1234",
  "opt.excludeHint":
    "A formula removes every entry with that composition (all polymorphs); a material id removes only that entry. Use it to drop implausible compositions or unreliable calculations.",

  // Result
  "fig.label": "Voltage profile and phase equilibria (zoomable, pannable)",
  "fig.range": "Voltage range",
  "fig.vMin": "Lower voltage limit (V)",
  "fig.vMax": "Upper voltage limit (V)",
  "fig.reset": "Reset view",
  "fig.help":
    "Wheel: zoom voltage / Shift+wheel or wheel over the x axis: zoom x / Drag: pan / Pinch: zoom / Double-click: reset / Hover or tap: details / Keyboard: + − arrows 0, [ ] to select a region, Shift+[ ] for phase details",
  "legend.ox": "Oxidation side (x &lt; 0, ion extraction)",
  "legend.red": "Reduction side (x &gt; 0, ion insertion)",
  "legend.window": "Stability window",
  "legend.axes":
    "x: working-ion uptake per formula unit of the target / horizontal lines: two-phase coexistence voltages",
  "dl.json": "Result JSON",
  "dl.entries": "Entry JSON",
  "table.title": "Phase equilibria and reactions",
  "table.range": "Voltage range (V)",
  "table.phases": "Equilibrium phases (per {formula})",
  "table.reaction": "Reaction",
  footer:
    "Voltages are V = −(μ − μ<sub>metal</sub>)/z, evaluated from grand potential phase diagrams following Ong et al., Chem. Mater. 20, 1798 (2008) and Zhu, He &amp; Mo, ACS Appl. Mater. Interfaces 7, 23685 (2015).",

  // Status and summary
  "status.loaded": "{source}{thermo}: {system} system, {n} entries",
  "status.demo": " — made-up energies. Fetch from MP for real data.",
  "status.fetching": "Fetching the {system} system…",
  "status.progress": "Fetching… {n}{total}",
  "summary.window": "Stability window",
  "summary.hullCorrected": " (hull-corrected)",
  "summary.regions": "Regions / plateaus",
  "summary.entries": "Entries used",
  "summary.noEntry": "No matching entry",
  "summary.notEvaluable": "Not evaluable (no matching entry)",
  "summary.reactsWithMetal": "Reacts with {ion} metal (below 0 V)",
  "summary.noneDecomposed": "None (decomposition products are stable)",
  "summary.noneAt": "None (decomposes at {v} V)",
  "note.stabilizedOn":
    "{formula} is placed on the hull for this evaluation. The E<sub>hull</sub> above is the uncorrected value; the window is for the corrected target.",
  "note.stabilizedBelow":
    "{formula} is placed {delta} meV/atom below the hull for this evaluation. The E<sub>hull</sub> above is the uncorrected value; the window is for the corrected target.",
  "note.notOnHull":
    "The target is not on the hull, so the phases at x = 0 are its decomposition products. Enable “Place the target on the hull” to evaluate a profile that includes the target.",
  "note.noTarget":
    "There is no entry for {formula}. No virtual phase is created; only the equilibria of the decomposition products are shown.",
  "note.excluded": "{n} entries excluded: {ids}.",
  "note.unmatched": "Items matching no entry: {items}.",

  // Errors raised by the page
  "err.missingElements": "The loaded data does not contain {elements}. Fetch it again from MP.",
  "err.lostRefs":
    "The exclusion removed every elemental entry of {elements}. Elements are the reference for formation energies and cannot be excluded; check the phases to exclude.",

  "opt.film": "Compute the film thickness (decomposition products form on the particle surface)",
  "opt.filmDiameter": "Particle diameter",
  "opt.filmFraction": "Decomposed fraction (of particle volume)",
  "opt.filmHint":
    "Assumes a spherical particle that decomposes from the surface, its products forming a dense mixed layer around the unreacted core. Product volumes come from MP volumes per atom, so the volume change is included.",
  "film.title": "Film model",
  "film.region": "Voltage region",
  "film.drag": "Drag (or use the arrow keys) to rotate",
  "film.column": "Film (thickness / volume change / vol% / capacity)",
  "film.none": "—",
  "film.unavailable": "Not available (no valid volume data: {phases})",
  "film.capacity": "{q} mAh/g",
  "film.fromCharge": "{f} % decomposed (full decomposition takes {full} mAh/g)",
  "film.noteCharge": "From the reacted charge of {q} mAh/g: ",
  "film.capped": "Fully decomposed (the charge exceeds the {full} mAh/g needed)",
  "film.chargeless": "Decomposition without charge transfer: not set by the charge",
  "film.gas": "Gas released: {list}",
  "film.noSolid": "No film (all products are gases)",
  "film.noteGasOnly":
    "All products are released as gas, so no film forms. With a {d} µm particle and {f} % decomposed, only the {core} µm core remains.",
  "opt.filmMode": "How the decomposed amount is given",
  "opt.filmModeFraction": "By decomposed fraction",
  "opt.filmModeCharge": "By reacted charge",
  "opt.filmCharge": "Reacted charge (per gram of target)",
  "opt.filmGas": "Phases released as gas (comma or newline separated)",
  "opt.filmGasPlaceholder": "e.g. CO2, SO2, PCl3",
  "opt.filmGasHint":
    "Elemental gases such as O₂ and Cl₂ (H, N, O, F, Cl, noble gases) always leave the film and are reported as released gas. Add gaseous or liquid compounds such as CO₂ here by formula or material id.",
  "film.full": "Fully decomposed: diameter {d0} → {d1} µm ({pct})",
  "film.diameter": "Outer diameter {d} µm ({pct})",
  "film.volumeChange": "Volume change: decomposed part {v} / whole particle {p}",
  "film.noteFull":
    "The whole {d} µm particle decomposes; the product particle is {out} µm in diameter ({pct}). There is no film: the whole particle is products.",
  "film.chartTitle": "Volume change",
  "film.chartAria": "Volume change of the decomposed part for each voltage region",
  "film.chartHint":
    "Volume change of the decomposed part (V_products / V_target − 1) for each voltage region; the whole particle changes by this times the decomposed fraction. Click a line to show that region in the 3D model.",
  "film.tooltip": "Film {t}",
  "film.invalid":
    "Film: enter a particle diameter (> 0 µm) and either a decomposed fraction (0–100 %) or a reacted charge (≥ 0 mAh/g).",
  "film.noRegion":
    "No voltage region has a film to compute (no decomposition products with volume data).",
  "film.core": "Unreacted {formula}",
  "film.note":
    "Particle diameter {d} µm, {f} % decomposed: the film is {t} thick (core {core} µm, outer diameter {out} µm, {pct}). Volume change: {v} for the decomposed part, {p} for the whole particle.",
  "film.exaggerated": "The film is drawn thicker than scale because it is very thin.",
  "film.aria": "Cutaway model of a {formula} particle with a {t} film",

  // Tooltip and figure
  "link.openMp": "Open {id} on Materials Project",
  "tip.plateau": "Plateau {v} V",
  "tip.uptake": "x: {from} → {to} ({dx} {ion} taken up)",
  "tip.range": "Voltage range: {range}",
  "tip.interval": "(region {range})",
  "plot.aria": "{ion} voltage profile and phase equilibria of {formula}",
  "plot.virtual": "virtual phase",
  "plot.originalEhull": "original E_hull: {v} meV/atom",
  "plot.stabilized": "Target placed on the hull ({source})",

  // Calculation core
  "formula.empty": "Empty formula",
  "formula.unparsable": 'Cannot parse the formula: "{formula}" (position {pos})',
  "formula.number": 'Misplaced number in the formula: "{formula}"',
  "formula.brackets": 'Unbalanced brackets: "{formula}"',
  "formula.emptyGroup": 'Empty brackets: "{formula}"',
  "formula.noElements": 'No elements: "{formula}"',
  "entries.missingRefs": "No elemental reference entry for: {elements}",
  "profile.needOtherElements": "Enter a composition that contains elements other than {ion}",

  // Materials Project API
  "mp.noKey": "Enter a Materials Project API key",
  "mp.network":
    "Could not reach the Materials Project API from the browser. The MP API does not allow browser requests (CORS) from sites other than materialsproject.org. Download the JSON with “Fetch with a command” below and load it.",
  "mp.http": "Materials Project API error: HTTP {status}{hint}",
  "mp.httpKeyHint": " (check your API key)",
  "mp.incomplete": "The Materials Project API response was incomplete. Fetch again.",

  // Entry files
  "io.staleMp":
    "This data uses Materials Project energy_per_atom. In the mixed scheme (GGA_GGA+U_R2SCAN) these values are not on one scale and the phase diagram is wrong. Fetch again with the current command or “Fetch from MP”.",
  "io.needCorrection": "entries[{i}]: energy_adjustments require a matching correction",
  "io.correctionNaN": "entries[{i}].correction is not a number",
  "io.badComposition": "entries[{i}].composition is invalid",
  "io.notObject": "entries[{i}] is not an object",
  "io.energyNaN": "entries[{i}].energyPerAtom is not a number",
  "io.nameNotString": "entries[{i}].name is not a string",
  "io.notThermoDoc": "data[{i}] is not a Materials Project thermo document",
  "io.invalidJson": "Not valid JSON",
  "io.noEntries": "No entries array found",
  "io.noFiles": "No file selected",
  "io.mixedThermo": "Mixed thermo types: {types}",
  "io.mixedBasis":
    "Files with different energy references are mixed. Fetch them again the same way.",
  "io.missingPages":
    "Only {docs} of {total} MP entries are present. Download every page (_page=1–{pages}) and load them together.",
};
