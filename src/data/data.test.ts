import { describe, expect, it, vi } from "vite-plus/test";
import { computeProfile } from "../core/profile";
import { parseEntryFiles, parseEntrySet, serializeEntrySet } from "./io";
import {
  curlCommand,
  fetchThermoEntries,
  MP_DEV_PROXY,
  MpHttpError,
  MpNetworkError,
  subChemsys,
  thermoUrl,
  type ThermoDoc,
} from "./mp";

const docs: ThermoDoc[] = [
  {
    material_id: "mp-1",
    formula_pretty: "Li",
    composition: { Li: 2 },
    energy_per_atom: -1.9,
    formation_energy_per_atom: 0,
    thermo_type: "R2SCAN",
  },
  {
    material_id: "mp-2",
    formula_pretty: "S",
    composition: { S: 32 },
    energy_per_atom: -4.1,
    formation_energy_per_atom: 0,
    thermo_type: "R2SCAN",
  },
  {
    material_id: "mp-3",
    formula_pretty: "Li2S",
    composition: { Li: 8, S: 4 },
    energy_per_atom: -1.5 + (2 / 3) * -1.9 + (1 / 3) * -4.1,
    formation_energy_per_atom: -1.5,
    thermo_type: "R2SCAN",
    volume: 186,
    nsites: 12,
  },
  {
    material_id: "mp-4",
    formula_pretty: "LiS",
    composition: { Li: 2, S: 2 },
    energy_per_atom: 0,
    thermo_type: "R2SCAN",
    deprecated: true,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("subChemsys", () => {
  it("lists all sub-systems", () => {
    expect(subChemsys(["S", "Li"])).toEqual(["Li", "S", "Li-S"]);
    expect(subChemsys(["Li", "P", "S", "Cl"])).toHaveLength(15);
  });
});

describe("fetchThermoEntries", () => {
  it("queries the thermo endpoint and drops deprecated docs", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: docs, meta: { total_doc: docs.length } }),
    );
    const { entries } = await fetchThermoEntries({
      apiKey: "k",
      elements: ["Li", "S"],
      thermoType: "R2SCAN",
      fetchFn,
    });
    expect(entries.map((e) => e.id)).toEqual(["mp-1", "mp-2", "mp-3"]);
    expect(entries[2].volumePerAtom).toBeCloseTo(15.5, 9);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const q = new URL(url).searchParams;
    expect(q.get("chemsys")).toBe("Li,S,Li-S");
    expect(q.get("thermo_types")).toBe("R2SCAN");
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("k");
  });

  it("follows pagination", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ ...docs[0], material_id: `mp-${i}` }));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: page1, meta: { total_doc: 1001 } }))
      .mockResolvedValueOnce(jsonResponse({ data: [docs[1]], meta: { total_doc: 1001 } }));
    const { entries } = await fetchThermoEntries({
      apiKey: "k",
      elements: ["Li", "S"],
      thermoType: "R2SCAN",
      fetchFn,
    });
    expect(entries).toHaveLength(1001);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reports auth errors", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 401));
    await expect(
      fetchThermoEntries({ apiKey: "bad", elements: ["Li"], thermoType: "R2SCAN", fetchFn }),
    ).rejects.toThrow(/401/);
    await expect(
      fetchThermoEntries({ apiKey: " ", elements: ["Li"], thermoType: "R2SCAN", fetchFn }),
    ).rejects.toThrow(/API key/);
  });
});

describe("entry JSON", () => {
  it("round-trips and gives the same profile", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: docs }));
    const { entries } = await fetchThermoEntries({
      apiKey: "k",
      elements: ["Li", "S"],
      thermoType: "R2SCAN",
      fetchFn,
    });
    const text = serializeEntrySet({
      version: 1,
      source: "materials-project",
      elements: ["Li", "S"],
      entries,
    });
    const back = parseEntrySet(text);
    expect(back.entries).toEqual(entries);
    const a = computeProfile({ entries, formula: "S", ion: "Li" });
    const b = computeProfile({ entries: back.entries, formula: "S", ion: "Li" });
    expect(b.plateaus).toEqual(a.plateaus);
    expect(a.plateaus[0].voltage).toBeCloseTo(2.25, 9);
  });

  it("reads pymatgen ComputedEntry dicts", () => {
    const set = parseEntrySet(
      JSON.stringify([
        {
          "@class": "ComputedEntry",
          entry_id: "mp-1",
          composition: { Li: 2 },
          energy: -3.8,
          correction: 0,
        },
        {
          "@class": "ComputedStructureEntry",
          entry_id: "mp-3",
          composition: { Li: 8, S: 4 },
          energy: -40,
          energy_adjustments: [{ value: -1 }, { value: 0.4 }],
          data: { thermo_type: "GGA_GGA+U" },
        },
      ]),
    );
    expect(set.entries[1]).toMatchObject({
      id: "mp-3",
      name: "Li2S",
      energyPerAtom: -40.6 / 12,
      thermoType: "GGA_GGA+U",
    });
    expect(set.elements).toEqual(["Li", "S"]);
  });

  it("rejects invalid files", () => {
    expect(() => parseEntrySet("nope")).toThrow();
    expect(() => parseEntrySet("{}")).toThrow(/entries/);
    expect(() => parseEntrySet('[{"composition":{"Li":1}}]')).toThrow(/energyPerAtom/);
  });
});

describe("review regressions", () => {
  it("preserves the total correction from real pymatgen adjustment dictionaries", () => {
    const set = parseEntrySet(
      JSON.stringify([
        { composition: { Li: 1 }, energy: 0 },
        { composition: { S: 1 }, energy: 0 },
        {
          "@class": "ComputedEntry",
          composition: { Li: 2, S: 1 },
          energy: -3,
          correction: -1.5,
          energy_adjustments: [
            { "@class": "CompositionEnergyAdjustment", adj_per_atom: -0.5, n_atoms: 3 },
          ],
        },
      ]),
    );
    expect(set.entries[2].energyPerAtom).toBe(-1.5);
    expect(
      computeProfile({ entries: set.entries, formula: "S", ion: "Li" }).plateaus[0].voltage,
    ).toBeCloseTo(2.25, 9);
  });

  it.each([{}, { Li: 0 }, { Li: -1 }, [], { Li: "1" }].map((composition) => ({ composition })))(
    "rejects invalid compositions in both formats: %j",
    ({ composition }) => {
      expect(() => parseEntrySet(JSON.stringify([{ composition, energyPerAtom: -1 }]))).toThrow(
        /composition/,
      );
      expect(() => parseEntrySet(JSON.stringify([{ composition, energy: -1 }]))).toThrow(
        /composition/,
      );
    },
  );

  it("removes zero components before reference selection", () => {
    const set = parseEntrySet(JSON.stringify([{ composition: { Li: 1, S: 0 }, energyPerAtom: 0 }]));
    expect(set.entries[0].composition).toEqual({ Li: 1 });
    expect(set.elements).toEqual(["Li"]);
  });

  it("rejects unsupported corrections rather than silently dropping them", () => {
    expect(() =>
      parseEntrySet(
        JSON.stringify([
          {
            composition: { Li: 2, S: 1 },
            energy: -3,
            energy_adjustments: [{ "@class": "UnknownAdjustment" }],
          },
        ]),
      ),
    ).toThrow(/correction|adjustment/);
  });

  it("rejects non-string phase names", () => {
    expect(() => parseEntrySet('[{"composition":{"Li":1},"energyPerAtom":0,"name":42}]')).toThrow(
      /name/,
    );
  });

  it("rejects partial API responses carrying errors", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: docs, errors: [{ message: "partial failure" }] }),
    );
    await expect(
      fetchThermoEntries({ apiKey: "k", elements: ["Li", "S"], thermoType: "R2SCAN", fetchFn }),
    ).rejects.toThrow(/API/);
  });
});

describe("browser access to the MP API", () => {
  it("turns blocked requests (CORS) into MpNetworkError", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      fetchThermoEntries({ apiKey: "k", elements: ["Li", "S"], thermoType: "R2SCAN", fetchFn }),
    ).rejects.toBeInstanceOf(MpNetworkError);
  });

  it("uses the given base URL and keeps HTTP status codes", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 404));
    const err = await fetchThermoEntries({
      apiKey: "k",
      baseUrl: MP_DEV_PROXY,
      elements: ["Li"],
      thermoType: "R2SCAN",
      fetchFn,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MpHttpError);
    expect((err as MpHttpError).status).toBe(404);
    expect(
      (fetchFn.mock.calls[0] as unknown as [string])[0].startsWith("/mp-api/materials/thermo/?"),
    ).toBe(true);
  });

  it("builds terminal commands that read the key from the environment", () => {
    const bash = curlCommand(["S", "Li"], "GGA_GGA+U_R2SCAN", "bash");
    expect(bash).toContain('-H "X-API-KEY: $MP_API_KEY"');
    expect(bash).toContain("-o mp_Li-S_GGA_GGA+U_R2SCAN_p1.json");
    const url = new URL(bash.match(/"(https:[^"]+)"/)![1]);
    expect(url.origin + url.pathname).toBe("https://api.materialsproject.org/materials/thermo/");
    expect(url.searchParams.get("thermo_types")).toBe("GGA_GGA+U_R2SCAN");
    expect(url.searchParams.get("chemsys")).toBe("Li,S,Li-S");
    expect(thermoUrl(["Li"], "R2SCAN", 3)).toContain("_page=3");
    expect(curlCommand(["Li"], "R2SCAN", "powershell")).toMatch(/^curl\.exe .*\$env:MP_API_KEY/);
  });
});

describe("raw MP API responses", () => {
  const page = (data: ThermoDoc[], total?: number) =>
    JSON.stringify({ data, meta: total === undefined ? {} : { total_doc: total } });

  it("reads a downloaded thermo response", () => {
    const set = parseEntrySet(page(docs, docs.length));
    expect(set.entries.map((e) => e.id)).toEqual(["mp-1", "mp-2", "mp-3"]);
    expect(set.elements).toEqual(["Li", "S"]);
    expect(set.thermoType).toBe("R2SCAN");
  });

  it("merges pages and warns when pages are missing", () => {
    const one = parseEntryFiles([{ name: "p1.json", text: page(docs.slice(0, 2), 4) }]);
    expect(one.warnings[0]).toMatch(/4 件中 2 件/);
    const both = parseEntryFiles([
      { name: "p1.json", text: page(docs.slice(0, 2), 4) },
      { name: "p2.json", text: page(docs.slice(1), 4) },
    ]);
    expect(both.warnings).toEqual([]);
    expect(both.set.entries.map((e) => e.id)).toEqual(["mp-1", "mp-2", "mp-3"]);
  });

  it("rejects mixed thermo types and names the bad file", () => {
    const other = { ...docs[0], material_id: "mp-9", thermo_type: "GGA_GGA+U" };
    expect(() =>
      parseEntryFiles([
        { name: "a.json", text: page(docs) },
        { name: "b.json", text: page([other]) },
      ]),
    ).toThrow(/混在/);
    expect(() => parseEntryFiles([{ name: "bad.json", text: "{" }])).toThrow(/bad\.json/);
  });
});
