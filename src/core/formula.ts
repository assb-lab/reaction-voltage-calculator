/** Element symbol -> amount. */
export type Composition = Record<string, number>;

const TOKEN = /([A-Z][a-z]?)|(\d*\.\d+|\d+)|([([{])|([)\]}])|(\s+)/y;

/**
 * Parse a chemical formula such as "Li6PS5Cl", "Ca3(PO4)2" or "Li0.5CoO2".
 * Throws on malformed input.
 */
export function parseFormula(formula: string): Composition {
  const stack: Composition[] = [{}];
  let pendingGroup: Composition | null = null;
  let lastElement: string | null = null;
  TOKEN.lastIndex = 0;
  let pos = 0;
  const src = formula.trim();
  if (!src) throw new Error("空の化学式です");

  const flushGroup = (mult: number) => {
    if (!pendingGroup) return;
    const top = stack[stack.length - 1];
    for (const [el, n] of Object.entries(pendingGroup)) top[el] = (top[el] ?? 0) + n * mult;
    pendingGroup = null;
  };

  while (pos < src.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`化学式を解釈できません: "${formula}" (位置 ${pos + 1})`);
    pos = TOKEN.lastIndex;
    const [, el, num, open, close] = m;
    if (el) {
      flushGroup(1);
      const top = stack[stack.length - 1];
      top[el] = (top[el] ?? 0) + 1;
      lastElement = el;
    } else if (num) {
      const n = Number(num);
      if (pendingGroup) {
        flushGroup(n);
      } else if (lastElement) {
        const top = stack[stack.length - 1];
        top[lastElement] += n - 1;
      } else {
        throw new Error(`化学式の数字の位置が不正です: "${formula}"`);
      }
      lastElement = null;
    } else if (open) {
      flushGroup(1);
      stack.push({});
      lastElement = null;
    } else if (close) {
      flushGroup(1);
      if (stack.length < 2) throw new Error(`括弧の対応が不正です: "${formula}"`);
      pendingGroup = stack.pop()!;
      lastElement = null;
    }
  }
  flushGroup(1);
  if (stack.length !== 1) throw new Error(`括弧の対応が不正です: "${formula}"`);
  const comp = stack[0];
  for (const [el, n] of Object.entries(comp)) if (!(n > 0)) delete comp[el];
  if (Object.keys(comp).length === 0) throw new Error(`元素がありません: "${formula}"`);
  return comp;
}

export function numAtoms(comp: Composition): number {
  return Object.values(comp).reduce((a, b) => a + b, 0);
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Composition divided by the gcd of its amounts when they are (near-)integers. */
export function reduceComposition(comp: Composition): { reduced: Composition; factor: number } {
  const vals = Object.values(comp);
  const ints = vals.every((v) => Math.abs(v - Math.round(v)) < 1e-6);
  let factor = 1;
  if (ints) factor = vals.map((v) => Math.round(v)).reduce(gcd);
  const reduced: Composition = {};
  for (const [el, n] of Object.entries(comp)) reduced[el] = n / factor;
  return { reduced, factor };
}

export function formatNumber(n: number, digits = 3): string {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return Number(n.toFixed(digits)).toString();
}

/** Formula string in the given element order (default: insertion order). */
export function formatFormula(comp: Composition, order?: string[]): string {
  const els = order ? order.filter((e) => e in comp) : Object.keys(comp);
  return els
    .map((el) => (Math.abs(comp[el] - 1) < 1e-9 ? el : el + formatNumber(comp[el])))
    .join("");
}

export function elementsOf(comp: Composition): string[] {
  return Object.keys(comp).sort();
}
