export interface LpResult {
  x: Float64Array;
  value: number;
}

const EPS = 1e-10;

/**
 * Solve  min c·x  s.t.  A x = b,  x >= 0  with a dense two-phase tableau simplex
 * (Bland's rule). Intended for few constraints (number of elements) and many
 * variables (number of phases). Throws if infeasible or unbounded.
 */
export function solveLp(A: number[][], b: number[], c: ArrayLike<number>): LpResult {
  const m = A.length;
  const n = c.length;
  const width = n + m + 1; // variables, artificials, rhs
  const T: Float64Array[] = [];
  for (let i = 0; i < m; i++) {
    const row = new Float64Array(width);
    const sign = b[i] < 0 ? -1 : 1;
    for (let j = 0; j < n; j++) row[j] = sign * A[i][j];
    row[n + i] = 1;
    row[width - 1] = sign * b[i];
    T.push(row);
  }
  const basis = Array.from({ length: m }, (_, i) => n + i);

  const pivot = (r: number, col: number) => {
    const pr = T[r];
    const p = pr[col];
    for (let j = 0; j < width; j++) pr[j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i][col];
      if (f === 0) continue;
      const row = T[i];
      for (let j = 0; j < width; j++) row[j] -= f * pr[j];
    }
    basis[r] = col;
  };

  // Reduced costs for a cost vector over all columns.
  const run = (cost: Float64Array, allowed: number) => {
    for (let iter = 0; iter < 50000; iter++) {
      // Bland: smallest index with negative reduced cost.
      let enter = -1;
      for (let j = 0; j < allowed; j++) {
        let rc = cost[j];
        for (let i = 0; i < m; i++) rc -= cost[basis[i]] * T[i][j];
        if (rc < -EPS) {
          enter = j;
          break;
        }
      }
      if (enter < 0) return;
      let leave = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][enter];
        if (a > EPS) {
          const ratio = T[i][width - 1] / a;
          if (ratio < best - EPS || (Math.abs(ratio - best) <= EPS && basis[i] < basis[leave])) {
            best = ratio;
            leave = i;
          }
        }
      }
      if (leave < 0) throw new Error("LP is unbounded");
      pivot(leave, enter);
    }
    throw new Error("LP iteration limit reached");
  };

  // Phase 1: minimise the sum of artificials.
  const c1 = new Float64Array(n + m);
  for (let i = 0; i < m; i++) c1[n + i] = 1;
  run(c1, n + m);
  let infeas = 0;
  for (let i = 0; i < m; i++) if (basis[i] >= n) infeas += T[i][width - 1];
  if (infeas > 1e-7) throw new Error("LP is infeasible");
  // Drive remaining (zero-valued) artificials out of the basis.
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) continue;
    for (let j = 0; j < n; j++) {
      if (Math.abs(T[i][j]) > 1e-9) {
        pivot(i, j);
        break;
      }
    }
  }

  // Phase 2 over the original variables only.
  const c2 = new Float64Array(n + m);
  for (let j = 0; j < n; j++) c2[j] = c[j];
  run(c2, n);

  const x = new Float64Array(n);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][width - 1];
  let value = 0;
  for (let j = 0; j < n; j++) value += c[j] * x[j];
  return { x, value };
}
