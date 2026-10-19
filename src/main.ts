import "./style.css";
import { excludeEntries, parseExcludeList, type Entry, type ExcludeResult } from "./core/entries";
import { formatNumber, parseFormula } from "./core/formula";
import { computeProfile, regionReaction, type Profile } from "./core/profile";
import { parseEntryFiles, serializeEntrySet, type EntrySet } from "./data/io";
import {
  curlCommand,
  fetchThermoEntries,
  MP_API_BASE,
  MP_DEV_PROXY,
  MpHttpError,
  MpNetworkError,
  type Shell,
  type ThermoType,
} from "./data/mp";
import { demoEntrySet } from "./ui/demo";
import { download, profileToCsv, profileToJson } from "./ui/export";
import { renderProfileSvg } from "./ui/plot";
import { mountChart, voltageRange, type Chart } from "./ui/chart";
import { escapeHtml, formulaHtml, idLinkHtml, phaseLinkHtml } from "./ui/html";
import { stabilityWindowText } from "./ui/summary";
import { markOnboarded, shouldShowOnboarding } from "./ui/onboarding";
import { applyTheme, loadTheme, saveTheme, type Theme } from "./ui/theme";
import { loadLang, saveLang, setLang, t, translateDom, type Lang } from "./i18n";
import { filmForRegion, type FilmOptions } from "./core/film";
import { filmCellHtml, filmGasHtml, formatChange, formatLengthNm } from "./ui/film";
import {
  CORE_COLOR,
  displayCoreRatio,
  mountParticle,
  PHASE_COLORS,
  type ParticleView,
} from "./ui/particle3d";
import { renderVolumeChartSvg, type RegionFilms } from "./ui/volumeChart";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("form");
const formulaInput = $<HTMLInputElement>("formula");
const ionSelect = $<HTMLSelectElement>("ion");
const thermoSelect = $<HTMLSelectElement>("thermo");
const apiKeyInput = $<HTMLInputElement>("apikey");
const saveKey = $<HTMLInputElement>("savekey");
const fetchButton = $<HTMLButtonElement>("fetch");
const fileInput = $<HTMLInputElement>("file");
const demoButton = $<HTMLButtonElement>("demo");
const dataStatus = $<HTMLParagraphElement>("dataStatus");
const stabilize = $<HTMLInputElement>("stabilize");
const delta = $<HTMLInputElement>("delta");
const excludeInput = $<HTMLTextAreaElement>("exclude");
const filmToggle = $<HTMLInputElement>("film");
const filmOptionsBox = $<HTMLDivElement>("filmOptions");
const filmDiameter = $<HTMLInputElement>("filmDiameter");
const filmFraction = $<HTMLInputElement>("filmFraction");
const filmGas = $<HTMLTextAreaElement>("filmGas");
const result = $<HTMLElement>("result");
const errorBox = $<HTMLParagraphElement>("error");

const KEY_STORAGE = "rvc.mpApiKey";
const FORM_STORAGE = "rvc.form";

let data: EntrySet | null = null;
let profile: Profile | null = null;
let chart: Chart | null = null;
let exclusion: ExcludeResult | null = null;
/** Current data status line, rebuilt when the language changes. */
let statusText: (() => string) | null = null;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function restore(): void {
  const key = storageGet(KEY_STORAGE);
  if (key) {
    apiKeyInput.value = key;
    saveKey.checked = true;
  }
  try {
    const f = JSON.parse(storageGet(FORM_STORAGE) ?? "null");
    if (f) {
      formulaInput.value = f.formula ?? formulaInput.value;
      ionSelect.value = f.ion ?? ionSelect.value;
      thermoSelect.value = f.thermo ?? thermoSelect.value;
      excludeInput.value = f.exclude ?? "";
      filmToggle.checked = !!f.film;
      filmDiameter.value = f.filmDiameter ?? filmDiameter.value;
      filmFraction.value = f.filmFraction ?? filmFraction.value;
      filmGas.value = f.filmGas ?? "";
      filmOptionsBox.hidden = !filmToggle.checked;
    }
  } catch {
    /* ignore */
  }
}

function persist(): void {
  storageSet(
    FORM_STORAGE,
    JSON.stringify({
      formula: formulaInput.value,
      ion: ionSelect.value,
      thermo: thermoSelect.value,
      exclude: excludeInput.value,
      film: filmToggle.checked,
      filmDiameter: filmDiameter.value,
      filmFraction: filmFraction.value,
      filmGas: filmGas.value,
    }),
  );
  storageSet(KEY_STORAGE, saveKey.checked && apiKeyInput.value ? apiKeyInput.value : null);
}

function showError(msg: string | null): void {
  errorBox.hidden = !msg;
  errorBox.textContent = msg ?? "";
}

function requiredElements(): string[] {
  return [...new Set([...Object.keys(parseFormula(formulaInput.value)), ionSelect.value])].sort();
}

function setData(set: EntrySet, demo = false): void {
  data = set;
  const tt = set.thermoType ? ` / ${set.thermoType}` : "";
  statusText = () =>
    t("status.loaded", {
      source: set.source,
      thermo: tt,
      system: set.elements.join("-"),
      n: set.entries.length,
    }) + (demo ? t("status.demo") : "");
  dataStatus.textContent = statusText();
}

function recompute(): void {
  showError(null);
  if (!data) return;
  try {
    const need = requiredElements();
    const missing = need.filter((el) => !data!.elements.includes(el));
    if (missing.length) {
      throw new Error(t("err.missingElements", { elements: missing.join(", ") }));
    }
    exclusion = excludeEntries(data.entries, parseExcludeList(excludeInput.value));
    const lostRefs = need.filter(
      (el) =>
        exclusion!.excluded.some((e) => isElemental(e, el)) &&
        !exclusion!.entries.some((e) => isElemental(e, el)),
    );
    if (lostRefs.length) {
      throw new Error(t("err.lostRefs", { elements: lostRefs.join(", ") }));
    }
    profile = computeProfile({
      entries: exclusion.entries,
      formula: formulaInput.value.trim(),
      ion: ionSelect.value,
      stabilize: {
        enabled: stabilize.checked,
        delta: (Number(delta.value) || 0) / 1000,
        allowVirtual: false,
      },
    });
    render(profile);
  } catch (e) {
    result.hidden = true;
    showError((e as Error).message);
  }
}

function isElemental(e: Entry, el: string): boolean {
  const els = Object.keys(e.composition);
  return els.length === 1 && els[0] === el;
}

function excludeNote(): string {
  if (!exclusion || (!exclusion.excluded.length && !exclusion.unmatched.length)) return "";
  const ids = exclusion.excluded.map((e) => `${e.name} (${e.id})`).join(", ");
  const removed = exclusion.excluded.length
    ? t("note.excluded", { n: exclusion.excluded.length, ids: escapeHtml(ids) })
    : "";
  const unmatched = exclusion.unmatched.length
    ? t("note.unmatched", { items: escapeHtml(exclusion.unmatched.join(", ")) })
    : "";
  return `<p class="note">${removed}${unmatched}</p>`;
}

function fmtV(v: number): string {
  return v === Infinity ? "∞" : `${v.toFixed(3)}`;
}

function render(p: Profile): void {
  result.hidden = false;
  const film = filmOptions();
  const w = p.window;
  const windowText = stabilityWindowText(p);
  const hull =
    p.eAboveHull === null
      ? t("summary.noEntry")
      : `${formatNumber(p.eAboveHull * 1000, 1)} meV/atom`;
  $("summary").innerHTML = `
    <div><span>${t("summary.window")}${p.stabilized ? t("summary.hullCorrected") : ""}</span><strong>${windowText}</strong></div>
    <div><span>E<sub>hull</sub> (${formulaHtml(p.formula)}${p.targetEntry && p.eAboveHull !== null ? `, ${idLinkHtml(p.targetEntry.id)}` : ""})</span><strong>${hull}</strong></div>
    <div><span>${t("summary.regions")}</span><strong>${p.regions.length} / ${p.plateaus.length}</strong></div>
    <div><span>${t("summary.entries")}</span><strong>${p.nEntries}</strong></div>
    ${p.stabilized ? `<p class="note">${Number(delta.value) > 0 ? t("note.stabilizedBelow", { formula: formulaHtml(p.formula), delta: formatNumber(Number(delta.value)) }) : t("note.stabilizedOn", { formula: formulaHtml(p.formula) })}</p>` : ""}
    ${w && !w.targetIsPhase && p.eAboveHull !== null && !p.stabilized ? `<p class="note">${t("note.notOnHull")}</p>` : ""}
    ${excludeNote()}
    ${!p.targetEntry ? `<p class="note">${t("note.noTarget", { formula: formulaHtml(p.formula) })}</p>` : ""}
    ${filmToggle.checked && !film ? `<p class="note">${t("film.invalid")}</p>` : ""}`;
  chart?.destroy();
  chart = mountChart(
    $("figure"),
    p,
    (view) => {
      const fmt = (v: number) => String(Number(v.toFixed(3)));
      if (document.activeElement !== vMinInput) vMinInput.value = fmt(view.vMin);
      if (document.activeElement !== vMaxInput) vMaxInput.value = fmt(view.vMax);
    },
    { film },
  );

  const rows = p.regions
    .map((r) => {
      const atZero = Math.abs(r.x) < 1e-9;
      const side = atZero ? "" : r.x < 0 ? "ox" : "red";
      const phases = r.phases
        .map((ph) => `<span>${formatNumber(ph.amount)} ${phaseLinkHtml(ph.entry)}</span>`)
        .join(" + ");
      return `<tr class="${side}${atZero ? " zero" : ""}">
        <td>${fmtV(r.vMin)} – ${fmtV(r.vMax)}</td>
        <td>${formatNumber(r.x)}</td>
        <td>${phases}</td>
        <td class="rxn">${formulaHtml(regionReaction(p, r))}</td>
        ${film ? `<td class="film">${filmCellHtml(filmForRegion(p, r, film))}</td>` : ""}
      </tr>`;
    })
    .join("");
  $("regions").innerHTML = `<thead><tr><th>${t("table.range")}</th><th>Δx (${p.ion})</th><th>${t(
    "table.phases",
    {
      formula: formulaHtml(p.formula),
    },
  )}</th><th>${t("table.reaction")}</th>${film ? `<th>${t("film.column")}</th>` : ""}</tr></thead><tbody>${rows}</tbody>`;
  renderFilmPanel(p, film);
}

/** Film options from the form; null when the mode is off or the inputs are invalid. */
function filmOptions(): FilmOptions | null {
  if (!filmToggle.checked) return null;
  const diameterUm = Number(filmDiameter.value);
  const percent = Number(filmFraction.value);
  if (!(diameterUm > 0) || !(percent >= 0 && percent <= 100)) return null;
  return { diameterUm, fraction: percent / 100, gasPhases: parseExcludeList(filmGas.value) };
}

// 3D cutaway of the coated particle for one voltage region.
const filmPanel = $<HTMLElement>("filmPanel");
const filmRegion = $<HTMLSelectElement>("filmRegion");
const filmCanvas = $<HTMLCanvasElement>("filmCanvas");
let particle: ParticleView | null = null;
let filmContext: { p: Profile; opts: FilmOptions } | null = null;
const volumeChart = $<HTMLDivElement>("volumeChart");

function renderFilmPanel(p: Profile, opts: FilmOptions | null): void {
  // Keep the selected region across re-renders of the same system (options, language).
  const sameSystem =
    filmContext?.p.formula === p.formula && filmContext.p.regions.length === p.regions.length;
  filmContext = opts ? { p, opts } : null;
  filmPanel.hidden = !opts;
  if (!opts) return;
  const previous = sameSystem && filmRegion.value !== "" ? Number(filmRegion.value) : -1;
  const all = p.regions.map((r, i) => ({ r, i, film: filmForRegion(p, r, opts) }));
  const candidates = all.filter((c) => c.film.kind === "film");
  filmRegion.innerHTML = candidates
    .map(
      (c) =>
        `<option value="${c.i}">${fmtV(c.r.vMin)} – ${fmtV(c.r.vMax)} V: ${escapeHtml(
          c.r.phases.map((ph) => ph.entry.name).join(" + "),
        )}</option>`,
    )
    .join("");
  filmRegion.disabled = !candidates.length;
  filmCanvas.hidden = !candidates.length;
  regionFilms = all.map((c) => ({ region: c.i, film: c.film }));
  if (!candidates.length) {
    renderVolumeChart(null);
    $("filmLegend").innerHTML = "";
    $("filmNote").textContent = t("film.noRegion");
    return;
  }
  // Keep the selection; otherwise start next to the target (smallest |x|, reduction first).
  const keep = candidates.find((c) => c.i === previous);
  const start =
    keep ?? [...candidates].sort((a, b) => Math.abs(a.r.x) - Math.abs(b.r.x) || b.r.x - a.r.x)[0];
  filmRegion.value = String(start.i);
  drawFilm();
}

let regionFilms: RegionFilms = [];

function renderVolumeChart(selected: number | null): void {
  if (!filmContext) return;
  volumeChart.innerHTML = renderVolumeChartSvg(
    filmContext.p,
    regionFilms,
    selected,
    t("film.chartAria"),
  );
}

volumeChart.addEventListener("click", (ev) => {
  const level = (ev.target as Element).closest<SVGGElement>("[data-region]");
  const option = level && filmRegion.querySelector(`option[value="${level.dataset.region}"]`);
  if (!option) return;
  filmRegion.value = level.dataset.region!;
  drawFilm();
});

function drawFilm(): void {
  if (!filmContext) return;
  const { p, opts } = filmContext;
  renderVolumeChart(Number(filmRegion.value));
  const region = p.regions[Number(filmRegion.value)];
  const film = region && filmForRegion(p, region, opts);
  if (!film || film.kind !== "film") return;
  // Without solid products there is no film: draw the bare core (or nothing if it is all gone).
  const solid = film.phases.length > 0;
  const { coreRatio, exaggerated } = solid
    ? displayCoreRatio(film.coreDiameterUm, film.outerDiameterUm)
    : { coreRatio: 1, exaggerated: false };
  filmCanvas.hidden = !solid && film.fullyDecomposed;
  const phases = film.phases.map((ph, i) => ({
    name: ph.entry.name,
    color: PHASE_COLORS[i % PHASE_COLORS.length],
    volFraction: ph.volFraction,
  }));
  const model = { coreRatio, phases };
  if (particle) particle.update(model);
  else particle = mountParticle(filmCanvas, model);
  const swatch = (color: string) => `<span class="swatch-box" style="background:${color}"></span>`;
  $("filmLegend").innerHTML = [
    ...(film.coreDiameterUm > 0
      ? [
          `<li>${swatch(CORE_COLOR)}<span>${t("film.core", { formula: formulaHtml(p.formula) })}</span></li>`,
        ]
      : []),
    ...phases.map(
      (ph) =>
        `<li>${swatch(ph.color)}<span>${formulaHtml(ph.name)} ${formatNumber(ph.volFraction * 100, 1)} vol%</span></li>`,
    ),
    ...(film.gases.length ? [`<li><span>${filmGasHtml(film)}</span></li>`] : []),
  ].join("");
  const change = {
    pct: formatChange(film.diameterChange),
    v: formatChange(film.volumeChange),
    p: formatChange(film.particleVolumeChange),
  };
  $("filmNote").innerHTML = !solid
    ? t("film.noteGasOnly", {
        d: formatNumber(opts.diameterUm),
        f: formatNumber(opts.fraction * 100),
        core: film.coreDiameterUm.toFixed(3),
      })
    : film.fullyDecomposed
      ? t("film.noteFull", {
          d: formatNumber(opts.diameterUm),
          out: film.outerDiameterUm.toFixed(3),
          pct: change.pct,
        })
      : [
          t("film.note", {
            d: formatNumber(opts.diameterUm),
            f: formatNumber(opts.fraction * 100),
            t: formatLengthNm(film.thicknessNm),
            core: film.coreDiameterUm.toFixed(3),
            out: film.outerDiameterUm.toFixed(3),
            ...change,
          }),
          exaggerated ? t("film.exaggerated") : "",
        ].join(" ");
  filmCanvas.setAttribute(
    "aria-label",
    t("film.aria", { formula: p.formula, t: formatLengthNm(film.thicknessNm) }),
  );
}

filmRegion.addEventListener("change", drawFilm);

async function fetchFromMp(): Promise<void> {
  showError(null);
  persist();
  let elements: string[];
  try {
    elements = requiredElements();
  } catch (e) {
    showError((e as Error).message);
    return;
  }
  fetchButton.disabled = true;
  dataStatus.textContent = t("status.fetching", { system: elements.join("-") });
  try {
    const thermoType = thermoSelect.value as ThermoType;
    const fetchFrom = (baseUrl: string) =>
      fetchThermoEntries({
        apiKey: apiKeyInput.value,
        baseUrl,
        elements,
        thermoType,
        onProgress: (n, total) =>
          (dataStatus.textContent = t("status.progress", { n, total: total ? ` / ${total}` : "" })),
      });
    let fetched;
    try {
      // `vp dev` / `vp preview` proxy the API on localhost; other servers return 404 there.
      fetched = await fetchFrom(isLocalHost() ? MP_DEV_PROXY : MP_API_BASE);
    } catch (e) {
      if (!(isLocalHost() && e instanceof MpHttpError && e.status === 404)) throw e;
      fetched = await fetchFrom(MP_API_BASE);
    }
    setData({
      version: 1,
      source: "Materials Project",
      thermoType,
      elements,
      fetchedAt: new Date().toISOString(),
      energyBasis: fetched.energyBasis,
      entries: fetched.entries,
    });
    recompute();
  } catch (e) {
    dataStatus.textContent = "";
    statusText = null;
    showError((e as Error).message);
    if (e instanceof MpNetworkError) {
      cliHelp.open = true;
      cliHelp.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } finally {
    fetchButton.disabled = false;
  }
}

function isLocalHost(): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

// Terminal commands for downloading MP data outside the browser.
const cliHelp = $<HTMLDetailsElement>("cliHelp");

function selectedShell(): Shell {
  return (document.querySelector<HTMLInputElement>('input[name="shell"]:checked')?.value ??
    "bash") as Shell;
}

function updateCommands(): void {
  let elements: string[];
  try {
    elements = requiredElements();
  } catch {
    $("cmdFetch").textContent = t("cli.invalidFormula");
    return;
  }
  const shell = selectedShell();
  const cmd = curlCommand(elements, thermoSelect.value as ThermoType, shell);
  $("cmdEnv").textContent =
    shell === "powershell" ? '$env:MP_API_KEY = "<API key>"' : 'export MP_API_KEY="<API key>"';
  $("cmdFetch").textContent = cmd;
  $("cmdFile").textContent = cmd.match(/-o (\S+)/)?.[1] ?? "";
}

$("copyCmd").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("copyCmd");
  try {
    await navigator.clipboard.writeText($("cmdFetch").textContent ?? "");
    button.textContent = t("cli.copied");
  } catch {
    button.textContent = t("cli.copyFailed");
  }
  setTimeout(() => (button.textContent = t("cli.copy")), 2000);
});
for (const el of [
  formulaInput,
  ionSelect,
  thermoSelect,
  ...document.querySelectorAll<HTMLInputElement>('input[name="shell"]'),
]) {
  el.addEventListener("change", updateCommands);
}
formulaInput.addEventListener("input", updateCommands);

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  void fetchFromMp();
});

fileInput.addEventListener("change", async () => {
  const files = [...(fileInput.files ?? [])];
  if (!files.length) return;
  try {
    const { set, warnings } = parseEntryFiles(
      await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))),
    );
    setData(set);
    recompute();
    if (warnings.length) showError(warnings.join("\n"));
  } catch (e) {
    showError((e as Error).message);
  } finally {
    fileInput.value = "";
  }
});

$("loadJson").addEventListener("click", () => fileInput.click());

demoButton.addEventListener("click", () => {
  formulaInput.value = "Li6PS5Cl";
  ionSelect.value = "Li";
  setData(demoEntrySet(), true);
  recompute();
});

filmToggle.addEventListener("change", () => (filmOptionsBox.hidden = !filmToggle.checked));
for (const el of [
  formulaInput,
  ionSelect,
  stabilize,
  delta,
  excludeInput,
  filmToggle,
  filmDiameter,
  filmFraction,
  filmGas,
]) {
  el.addEventListener("change", () => {
    persist();
    recompute();
  });
}
saveKey.addEventListener("change", persist);

// Voltage range inputs and reset for the interactive figure.
const vMinInput = $<HTMLInputElement>("vMin");
const vMaxInput = $<HTMLInputElement>("vMax");
for (const input of [vMinInput, vMaxInput]) {
  input.addEventListener("change", () => {
    if (!chart) return;
    const range = voltageRange(vMinInput.valueAsNumber, vMaxInput.valueAsNumber);
    if (range) chart.setView({ ...chart.view(), vMin: range[0], vMax: range[1] });
    else {
      const v = chart.view();
      vMinInput.value = String(Number(v.vMin.toFixed(3)));
      vMaxInput.value = String(Number(v.vMax.toFixed(3)));
    }
  });
}
$("resetView").addEventListener("click", () => chart?.reset());

const stem = () => (profile ? `${profile.formula}_${profile.ion}` : "profile");
$("dlSvg").addEventListener("click", () => {
  if (profile) download(`${stem()}.svg`, renderProfileSvg(profile, chart?.view()), "image/svg+xml");
});
$("dlCsv").addEventListener("click", () => {
  if (profile) download(`${stem()}.csv`, profileToCsv(profile), "text/csv");
});
$("dlJson").addEventListener("click", () => {
  if (profile) download(`${stem()}.json`, profileToJson(profile), "application/json");
});
$("dlEntries").addEventListener("click", () => {
  if (data)
    download(
      `entries_${data.elements.join("-")}.json`,
      serializeEntrySet(data),
      "application/json",
    );
});

// Onboarding guide: shown on the first visit, reopened from the header.
const onboarding = $<HTMLElement>("onboarding");
const helpToggle = $<HTMLButtonElement>("helpToggle");
const browserStorage = (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})();

function setOnboarding(open: boolean): void {
  onboarding.hidden = !open;
  helpToggle.setAttribute("aria-expanded", String(open));
  if (!open) markOnboarded(browserStorage);
}

helpToggle.addEventListener("click", () => {
  const open = !!onboarding.hidden;
  setOnboarding(open);
  if (open) onboarding.scrollIntoView({ behavior: "smooth", block: "start" });
});
for (const id of ["onbClose", "onbDone"]) {
  $(id).addEventListener("click", () => {
    setOnboarding(false);
    helpToggle.focus();
  });
}
$("onbKey").addEventListener("click", () => {
  apiKeyInput.scrollIntoView({ behavior: "smooth", block: "center" });
  apiKeyInput.focus({ preventScroll: true });
});
$("onbDemo").addEventListener("click", () => {
  setOnboarding(false);
  demoButton.click();
  result.scrollIntoView({ behavior: "smooth", block: "start" });
});
onboarding.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    setOnboarding(false);
    helpToggle.focus();
  }
});

// Language: saved choice, else the browser's (ja-* -> Japanese, otherwise English).
const langSelect = $<HTMLSelectElement>("lang");

function applyLanguage(lang: Lang): void {
  setLang(lang);
  langSelect.value = lang;
  document.documentElement.lang = lang;
  translateDom(document);
  updateCommands();
  if (statusText) dataStatus.textContent = statusText();
  // Re-render the result in the new language, keeping the zoomed view.
  const view = chart?.view();
  if (data) recompute();
  if (view) chart?.setView(view);
}

langSelect.addEventListener("change", () => {
  const lang = langSelect.value as Lang;
  saveLang(browserStorage, lang);
  applyLanguage(lang);
});

// Theme: auto (OS setting) / light / dark. index.html applies the saved choice before first paint.
const themeSelect = $<HTMLSelectElement>("theme");
themeSelect.value = loadTheme(browserStorage);
applyTheme(document.documentElement, themeSelect.value as Theme);
themeSelect.addEventListener("change", () => {
  const theme = themeSelect.value as Theme;
  applyTheme(document.documentElement, theme);
  saveTheme(browserStorage, theme);
});

if (shouldShowOnboarding(browserStorage)) {
  onboarding.hidden = false;
  helpToggle.setAttribute("aria-expanded", "true");
}
restore();
applyLanguage(loadLang(browserStorage, navigator.languages ?? [navigator.language]));
