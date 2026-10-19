"""Reference fixtures from pymatgen for the TypeScript voltage-profile core.

Each fixture holds a list of entries (in the web app's Entry format) and, per
target composition, the output of ``PhaseDiagram.get_element_profile``.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import random
from pathlib import Path
from typing import Any

from pymatgen.analysis.phase_diagram import PDEntry, PhaseDiagram
from pymatgen.core import Composition, Element


def entry_record(entry_id: str, comp: Composition, energy_per_atom: float) -> dict[str, Any]:
    return {
        "id": entry_id,
        "name": comp.reduced_formula,
        "composition": {el.symbol: float(n) for el, n in comp.items()},
        "energyPerAtom": energy_per_atom,
    }


def element_profile(pd: PhaseDiagram, ion: str, formula: str) -> list[dict[str, Any]]:
    """get_element_profile output, ordered from the oxidised (ion-poor) end."""
    comp = Composition(formula)
    ref = pd.el_refs[Element(ion)].energy_per_atom
    steps = []
    for item in pd.get_element_profile(Element(ion), comp):
        steps.append(
            {
                "x": float(item["evolution"]),
                "chempot": float(item["chempot"]),
                "mu": float(item["chempot"]) - ref,
                "phases": sorted({e.composition.reduced_formula for e in item["entries"]}),
            }
        )
    return sorted(steps, key=lambda s: s["x"])


def build_fixture(
    name: str,
    records: list[dict[str, Any]],
    ion: str,
    formulas: list[str],
) -> dict[str, Any]:
    entries = [
        PDEntry(Composition(r["composition"]), r["energyPerAtom"] * Composition(r["composition"]).num_atoms, name=r["id"])
        for r in records
    ]
    pd = PhaseDiagram(entries)
    cases = []
    for formula in formulas:
        e_hull = None
        target = Composition(formula)
        matching = [e for e in entries if e.composition.reduced_composition == target.reduced_composition]
        if matching:
            best = min(matching, key=lambda e: e.energy_per_atom)
            e_hull = float(pd.get_e_above_hull(best, allow_negative=True))
        cases.append(
            {
                "formula": formula,
                "eAboveHull": e_hull,
                "profile": element_profile(pd, ion, formula),
            }
        )
    return {"name": name, "ion": ion, "entries": records, "cases": cases}


def random_system(seed: int, ion: str, others: list[str]) -> dict[str, Any]:
    """Random compounds with random formation energies on top of random elemental references."""
    rng = random.Random(seed)
    elements = [ion, *others]
    refs = {el: rng.uniform(-8.0, -1.0) for el in elements}
    records: list[dict[str, Any]] = []

    def add(comp: Composition, formation: float) -> None:
        e = formation + sum(comp.get_atomic_fraction(Element(el)) * refs[el] for el in comp.chemical_system_set)
        records.append(entry_record(f"r{len(records)}", comp, e))

    for el in elements:
        add(Composition(el), 0.0)
        add(Composition(el), rng.uniform(0.01, 0.3))  # an unstable polymorph

    seen: set[str] = set()
    for k in range(2, len(elements) + 1):
        for subset in itertools.combinations(elements, k):
            for _ in range(rng.randint(2, 6)):
                comp = Composition({el: rng.randint(1, 6) for el in subset})
                key = comp.reduced_formula
                formation = rng.uniform(-1.8, 0.1)
                if key in seen:
                    formation += rng.uniform(-0.05, 0.2)
                seen.add(key)
                add(comp, formation)

    pd = PhaseDiagram(
        [PDEntry(Composition(r["composition"]), r["energyPerAtom"] * Composition(r["composition"]).num_atoms) for r in records]
    )
    stable = sorted(
        {e.composition.reduced_formula for e in pd.stable_entries if Element(ion) in e.composition and len(e.composition) > 1}
    )
    unstable = sorted(
        {
            Composition(r["composition"]).reduced_formula
            for r in records
            if ion in r["composition"] and len(r["composition"]) > 1
        }
        - set(stable)
    )
    li_free = sorted({Composition({el: rng.randint(1, 4) for el in others}).reduced_formula for _ in range(2)})
    formulas = stable[:4] + unstable[:3] + li_free
    return build_fixture(f"random-{seed}-{'-'.join(elements)}", records, ion, formulas)


def mp_system(formula: str, ion: str, thermo_type: str) -> dict[str, Any]:
    from mp_api.client import MPRester

    elements = sorted({el.symbol for el in Composition(formula).elements} | {ion})
    with MPRester(os.environ.get("MP_API_KEY")) as mpr:
        entries = mpr.get_entries_in_chemsys(elements, additional_criteria={"thermo_types": [thermo_type]})
    records = [
        entry_record(str(e.data.get("material_id", e.entry_id)), e.composition, e.energy_per_atom) for e in entries
    ]
    return build_fixture(f"mp-{'-'.join(elements)}-{thermo_type}", records, ion, [formula])


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate pymatgen reference fixtures.")
    parser.add_argument("--out", type=Path, default=Path("tests/fixtures"))
    parser.add_argument("--mp", metavar="FORMULA", help="also build a fixture from Materials Project (needs MP_API_KEY)")
    parser.add_argument("--ion", default="Li")
    parser.add_argument("--thermo-type", default="GGA_GGA+U_R2SCAN")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    fixtures = []
    if args.mp:
        fixtures.append(mp_system(args.mp, args.ion, args.thermo_type))
    else:
        systems = [
            ("Li", ["S"]),
            ("Li", ["P", "S"]),
            ("Li", ["P", "S", "Cl"]),
            ("Li", ["La", "Zr", "O"]),
            ("Na", ["Sb", "S"]),
            ("Mg", ["Mn", "O"]),
            ("Li", ["Ti", "P", "S", "O"]),
            ("Li", ["In", "Cl", "Br"]),
            ("Ca", ["Si", "N"]),
        ]
        for seed, (ion, others) in enumerate(systems):
            fixtures.append(random_system(seed, ion, others))

    for fx in fixtures:
        path = args.out / f"{fx['name']}.json"
        path.write_text(json.dumps(fx, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(fx['entries'])} entries, {len(fx['cases'])} cases)")
