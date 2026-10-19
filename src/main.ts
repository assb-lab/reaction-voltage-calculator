import "./style.css";
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
import { escapeHtml, formulaHtml } from "./ui/html";
import { stabilityWindowText } from "./ui/summary";
import { markOnboarded, shouldShowOnboarding } from "./ui/onboarding";

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
const result = $<HTMLElement>("result");
const errorBox = $<HTMLParagraphElement>("error");

const KEY_STORAGE = "rvc.mpApiKey";
const FORM_STORAGE = "rvc.form";

let data: EntrySet | null = null;
let profile: Profile | null = null;

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

function setData(set: EntrySet): void {
  data = set;
  const tt = set.thermoType ? ` / ${set.thermoType}` : "";
  dataStatus.textContent = `${set.source}${tt}: ${set.elements.join("-")} 系 ${set.entries.length} エントリ`;
}

function recompute(): void {
  showError(null);
  if (!data) return;
  try {
    const need = requiredElements();
    const missing = need.filter((el) => !data!.elements.includes(el));
    if (missing.length) {
      throw new Error(
        `読み込んだデータに ${missing.join(", ")} が含まれていません。MP から再取得してください。`,
      );
    }
    profile = computeProfile({
      entries: data.entries,
      formula: formulaInput.value.trim(),
      ion: ionSelect.value,
      stabilize: { enabled: stabilize.checked, delta: (Number(delta.value) || 0) / 1000 },
    });
    render(profile);
  } catch (e) {
    result.hidden = true;
    showError((e as Error).message);
  }
}

function fmtV(v: number): string {
  return v === Infinity ? "∞" : `${v.toFixed(3)}`;
}

function render(p: Profile): void {
  result.hidden = false;
  const w = p.window;
  const windowText = stabilityWindowText(p);
  const hull =
    p.eAboveHull === null ? "該当エントリなし" : `${formatNumber(p.eAboveHull * 1000, 1)} meV/atom`;
  $("summary").innerHTML = `
    <div><span>安定性ウィンドウ</span><strong>${windowText}</strong></div>
    <div><span>E<sub>hull</sub> (${formulaHtml(p.formula)})</span><strong>${hull}</strong></div>
    <div><span>平衡領域 / プラトー</span><strong>${p.regions.length} / ${p.plateaus.length}</strong></div>
    <div><span>使用エントリ</span><strong>${p.nEntries}</strong></div>
    ${p.stabilized ? `<p class="note">対象相を hull 上に置いて計算しています。</p>` : ""}
    ${w && !w.targetIsPhase && p.eAboveHull !== null && !p.stabilized ? `<p class="note">対象相は hull 上にありません。x = 0 の平衡相は分解生成物です。</p>` : ""}`;
  $("figure").innerHTML = renderProfileSvg(p);

  const rows = p.regions
    .map((r) => {
      const atZero = Math.abs(r.x) < 1e-9;
      const side = atZero ? "" : r.x < 0 ? "ox" : "red";
      const phases = r.phases
        .map(
          (ph) =>
            `<span title="${escapeHtml(ph.entry.id)}">${formatNumber(ph.amount)} ${formulaHtml(ph.entry.name)}</span>`,
        )
        .join(" + ");
      return `<tr class="${side}${atZero ? " zero" : ""}">
        <td>${fmtV(r.vMin)} – ${fmtV(r.vMax)}</td>
        <td>${formatNumber(r.x)}</td>
        <td>${phases}</td>
        <td class="rxn">${formulaHtml(regionReaction(p, r))}</td>
      </tr>`;
    })
    .join("");
  $("regions").innerHTML =
    `<thead><tr><th>電位範囲 (V)</th><th>Δx (${p.ion})</th><th>平衡相 (per ${formulaHtml(
      p.formula,
    )})</th><th>反応</th></tr></thead><tbody>${rows}</tbody>`;
}

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
  dataStatus.textContent = `${elements.join("-")} 系を取得中…`;
  try {
    const thermoType = thermoSelect.value as ThermoType;
    const fetchFrom = (baseUrl: string) =>
      fetchThermoEntries({
        apiKey: apiKeyInput.value,
        baseUrl,
        elements,
        thermoType,
        onProgress: (n, total) =>
          (dataStatus.textContent = `取得中… ${n}${total ? ` / ${total}` : ""}`),
      });
    let entries;
    try {
      // `vp dev` / `vp preview` proxy the API on localhost; other servers return 404 there.
      entries = await fetchFrom(isLocalHost() ? MP_DEV_PROXY : MP_API_BASE);
    } catch (e) {
      if (!(isLocalHost() && e instanceof MpHttpError && e.status === 404)) throw e;
      entries = await fetchFrom(MP_API_BASE);
    }
    setData({
      version: 1,
      source: "Materials Project",
      thermoType,
      elements,
      fetchedAt: new Date().toISOString(),
      entries,
    });
    recompute();
  } catch (e) {
    dataStatus.textContent = "";
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
    $("cmdFetch").textContent = "(組成を正しく入力してください)";
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
    button.textContent = "コピーしました";
  } catch {
    button.textContent = "コピーできませんでした";
  }
  setTimeout(() => (button.textContent = "コマンドをコピー"), 2000);
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
  setData(demoEntrySet());
  dataStatus.textContent += " — 架空のエネルギーです。実データは MP から取得してください。";
  recompute();
});

for (const el of [formulaInput, ionSelect, stabilize, delta]) {
  el.addEventListener("change", () => {
    persist();
    recompute();
  });
}
saveKey.addEventListener("change", persist);

const stem = () => (profile ? `${profile.formula}_${profile.ion}` : "profile");
$("dlSvg").addEventListener("click", () => {
  if (profile) download(`${stem()}.svg`, renderProfileSvg(profile), "image/svg+xml");
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

if (shouldShowOnboarding(browserStorage)) {
  onboarding.hidden = false;
  helpToggle.setAttribute("aria-expanded", "true");
}
restore();
updateCommands();
