import { describe, expect, it, vi } from "vite-plus/test";
import { computeProfile } from "../core/profile";
import { parseEntrySet, serializeEntrySet } from "./io";
import { fetchThermoEntries, subChemsys, type ThermoDoc } from "./mp";

const docs: ThermoDoc[] = [
  {
    material_id: "mp-1",
    formula_pretty: "Li",
    composition: { Li: 2 },
    energy_per_atom: -1.9,
    thermo_type: "R2SCAN",
  },
  {
    material_id: "mp-2",
    formula_pretty: "S",
    composition: { S: 32 },
    energy_per_atom: -4.1,
    thermo_type: "R2SCAN",
  },
  {
    material_id: "mp-3",
    formula_pretty: "Li2S",
    composition: { Li: 8, S: 4 },
    energy_per_atom: -1.5 + (2 / 3) * -1.9 + (1 / 3) * -4.1,
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
    const entries = await fetchThermoEntries({
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
    const entries = await fetchThermoEntries({
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
    const entries = await fetchThermoEntries({
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
