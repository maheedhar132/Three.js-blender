// A* route finding on the walkable visitor-route grid (2 m cells), then line-of-sight smoothing.
export function findPath(L, ax, az, bx, bz, grid = null) {
  // grid: optional Uint8Array of allowed cells (default: the public walkable network)
  const W = L.W, H = L.H, N = W * H, walk = grid || L.walk;
  const cell = (x, z) => [Math.floor((x - L.x0) / L.R), Math.floor((z - L.z0) / L.R)];
  const snap = (x, z) => {
    const [u, v] = cell(x, z);
    for (let r = 0; r < 25; r++) for (let dv = -r; dv <= r; dv++) for (let du = -r; du <= r; du++) {
      if (Math.max(Math.abs(du), Math.abs(dv)) !== r) continue;
      const uu = u + du, vv = v + dv; if (uu >= 0 && vv >= 0 && uu < W && vv < H && walk[vv * W + uu]) return vv * W + uu;
    }
    return -1;
  };
  const s = snap(ax, az), g = snap(bx, bz); if (s < 0 || g < 0) return null;
  const gx = g % W, gy = (g / W) | 0;
  const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const h = i => { const dx = Math.abs(i % W - gx), dy = Math.abs(((i / W) | 0) - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
  gs[s] = 0; push(h(s), s);
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  let found = false, iter = 0;
  while (heap.length && iter++ < 400000) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    if (i === g) { found = true; break; }
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy, c] of D) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (!walk[j] || closed[j]) continue;
      if (dx && dy && (!walk[y * W + nx] || !walk[ny * W + x])) continue;   // no corner cutting
      const ng = gs[i] + c; if (ng < gs[j]) { gs[j] = ng; came[j] = i; push(ng + h(j), j); }
    }
  }
  if (!found) return null;
  const cells = []; for (let i = g; i !== -1; i = came[i]) cells.push(i); cells.reverse();
  const pts = cells.map(i => [L.x0 + (i % W + 0.5) * L.R, L.z0 + (((i / W) | 0) + 0.5) * L.R]);
  // line-of-sight simplification
  const los = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 1); for (let k = 1; k < n; k++) { const t = k / n; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; if (grid ? L.sample(grid, x, z) < 0.75 : !L.isWalkable(x, z)) return false; } return true; };
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = Math.min(pts.length - 1, i + 40); while (j > i + 1 && !los(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
  return out;
}
export function pathLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
