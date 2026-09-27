/**
 * Centerline tracing: turn a bitmap of even-width lines into stroked paths, the way a designer
 * drew them, instead of the filled outline of every line.
 *
 * 1. A distance transform gives each ink pixel its distance to the nearest background pixel;
 *    along the middle of a line that is half the line width.
 * 2. Zhang–Suen thinning shrinks the ink to a one-pixel skeleton.
 * 3. The skeleton becomes a graph (ends, junctions, the lines between them); tiny spurs from
 *    bumps in the outline are pruned and pass-through junctions merged.
 * 4. Each line is simplified (Ramer–Douglas–Peucker) and smoothed into cubic curves, keeping
 *    sharp corners sharp.
 *
 * The result is only used when redrawing the skeleton at the measured width reproduces the
 * bitmap closely. Solid shapes fail that check and are traced as fills instead.
 */

export interface CenterlineResult {
  /** Path data in viewBox units, absolute M/L/C/Z. */
  d: string;
  /** Solid dots (a cart's wheels, the dot of an "i") as filled circles, in viewBox units. */
  dots: { x: number; y: number; r: number }[];
  /** Measured line width in viewBox units. */
  width: number;
  /** How well the lines, redrawn at that width, cover the original ink (intersection over union). */
  fit: number;
}

export interface CenterlineOptions {
  /** viewBox size the output is scaled to (the mask is n×n pixels). */
  viewBox?: number;
  /** Minimum fit to accept the result. */
  minFit?: number;
}

type Pt = [number, number];

const INF = 1e20;

/** Exact squared Euclidean distance transform of one row or column (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
}

/** Distance from every ink pixel to the nearest background pixel. */
export function distanceTransform(mask: Uint8Array, n: number): Float64Array {
  const g = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = mask[i] ? INF : 0;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = g[y * n + x];
    edt1d(f, n, d, v, z);
    for (let y = 0; y < n; y++) g[y * n + x] = d[y];
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = g[y * n + x];
    edt1d(f, n, d, v, z);
    for (let x = 0; x < n; x++) g[y * n + x] = Math.sqrt(d[x]);
  }
  return g;
}

// Neighbour offsets P2..P9, clockwise from north.
const NX = [0, 1, 1, 1, 0, -1, -1, -1];
const NY = [-1, -1, 0, 1, 1, 1, 0, -1];

/** Zhang–Suen thinning to a one-pixel-wide, 8-connected skeleton. */
export function thin(mask: Uint8Array, n: number): Uint8Array {
  const img = mask.slice();
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < n && y < n ? img[y * n + x] : 0);
  const remove: number[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      remove.length = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (!img[y * n + x]) continue;
          const p = NX.map((dx, i) => at(x + dx, y + NY[i]));
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
          if (a !== 1) continue;
          const [p2, , p4, , p6, , p8] = p;
          if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          remove.push(y * n + x);
        }
      }
      for (const i of remove) img[i] = 0;
      if (remove.length) changed = true;
    }
  }
  return img;
}

/** Connected ink shapes (8-connected), as lists of pixel indices. */
function components(mask: Uint8Array, n: number): number[][] {
  const seen = new Uint8Array(n * n);
  const out: number[][] = [];
  const stack: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (!mask[i] || seen[i]) continue;
    const comp: number[] = [];
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      comp.push(j);
      const x = j % n;
      const y = (j - x) / n;
      for (let k = 0; k < 8; k++) {
        const nx = x + NX[k];
        const ny = y + NY[k];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const q = ny * n + nx;
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

interface Edge {
  a: number;
  b: number;
  pts: Pt[];
  closed?: boolean;
}

/** The skeleton as lines between end and junction nodes, plus closed loops. */
function skeletonGraph(sk: Uint8Array, n: number): { edges: Edge[]; nodeCount: number; nodeKind: ('end' | 'junction' | 'dot')[] } {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && sk[y * n + x] === 1;
  const node = new Int32Array(n * n).fill(-1);
  const kind: ('end' | 'junction' | 'dot')[] = [];
  const centre: Pt[] = [];

  // Crossing number: 0→1 transitions around the pixel. 1 = line end, 2 = on a line, ≥3 = junction.
  const cross = (x: number, y: number) => {
    let c = 0;
    for (let i = 0; i < 8; i++) if (!on(x + NX[i], y + NY[i]) && on(x + NX[(i + 1) % 8], y + NY[(i + 1) % 8])) c++;
    return c;
  };
  const cls = new Int8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!on(x, y)) continue;
      const c = cross(x, y);
      const count = NX.reduce((s, dx, i) => s + (on(x + dx, y + NY[i]) ? 1 : 0), 0);
      cls[y * n + x] = count === 0 ? 4 : c >= 3 ? 3 : c === 1 ? 1 : 2;
    }

  // Adjacent junction pixels form one node, placed at their centroid.
  for (let i = 0; i < n * n; i++) {
    if (!cls[i] || cls[i] === 2 || node[i] >= 0) continue;
    const id = kind.length;
    kind.push(cls[i] === 3 ? 'junction' : cls[i] === 1 ? 'end' : 'dot');
    const stack = [i];
    node[i] = id;
    let sx = 0;
    let sy = 0;
    let count = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % n;
      const y = (j - x) / n;
      sx += x;
      sy += y;
      count++;
      if (cls[i] !== 3) continue;
      for (let k = 0; k < 8; k++) {
        const q = (y + NY[k]) * n + x + NX[k];
        if (on(x + NX[k], y + NY[k]) && cls[q] === 3 && node[q] < 0) {
          node[q] = id;
          stack.push(q);
        }
      }
    }
    centre.push([sx / count + 0.5, sy / count + 0.5]);
  }

  const visited = new Uint8Array(n * n);
  const edges: Edge[] = [];
  const nodeLinks = new Set<string>();
  const walk = (startNode: number, fromX: number, fromY: number, x: number, y: number): Edge => {
    const pts: Pt[] = [centre[startNode], [x + 0.5, y + 0.5]];
    visited[y * n + x] = 1;
    let [px, py] = [fromX, fromY];
    for (;;) {
      let next: Pt | null = null;
      let end = -1;
      // 4-neighbours first keeps the walk on the line through staircase corners.
      for (const k of [0, 2, 4, 6, 1, 3, 5, 7]) {
        const nx = x + NX[k];
        const ny = y + NY[k];
        if (!on(nx, ny) || (nx === px && ny === py)) continue;
        const q = ny * n + nx;
        if (node[q] >= 0) {
          if (!(node[q] === startNode && pts.length <= 2)) end = node[q];
          continue;
        }
        if (!visited[q] && !next) next = [nx, ny];
      }
      if (end >= 0 && (!next || pts.length > 2)) {
        pts.push(centre[end]);
        return { a: startNode, b: end, pts };
      }
      if (!next) return { a: startNode, b: -1, pts };
      [px, py] = [x, y];
      [x, y] = next;
      visited[y * n + x] = 1;
      pts.push([x + 0.5, y + 0.5]);
    }
  };

  for (let i = 0; i < n * n; i++) {
    if (node[i] < 0) continue;
    const x = i % n;
    const y = (i - x) / n;
    if (kind[node[i]] === 'dot') {
      edges.push({ a: node[i], b: node[i], pts: [centre[node[i]], centre[node[i]]] });
      continue;
    }
    for (let k = 0; k < 8; k++) {
      const nx = x + NX[k];
      const ny = y + NY[k];
      if (!on(nx, ny)) continue;
      const q = ny * n + nx;
      if (node[q] >= 0) {
        // Two nodes touching directly: one short line between them, recorded once.
        const [a, b] = [node[i], node[q]].sort((m, o) => m - o);
        if (a !== b && !nodeLinks.has(`${a}-${b}`)) {
          nodeLinks.add(`${a}-${b}`);
          edges.push({ a, b, pts: [centre[a], centre[b]] });
        }
        continue;
      }
      if (visited[q]) continue;
      edges.push(walk(node[i], x, y, nx, ny));
    }
  }

  // Whatever is left are loops with no ends or junctions (an "O").
  for (let i = 0; i < n * n; i++) {
    if (cls[i] !== 2 || visited[i]) continue;
    const x = i % n;
    const y = (i - x) / n;
    const id = kind.length;
    kind.push('end');
    centre.push([x + 0.5, y + 0.5]);
    node[i] = id;
    visited[i] = 1;
    const loop: Edge = { a: id, b: id, pts: [centre[id]], closed: true };
    let [px, py, cx, cy] = [x, y, x, y];
    for (;;) {
      let next: Pt | null = null;
      for (const k of [0, 2, 4, 6, 1, 3, 5, 7]) {
        const nx = cx + NX[k];
        const ny = cy + NY[k];
        if (!on(nx, ny) || (nx === px && ny === py)) continue;
        if (!visited[ny * n + nx]) {
          next = [nx, ny];
          break;
        }
      }
      if (!next) break;
      [px, py] = [cx, cy];
      [cx, cy] = next;
      visited[cy * n + cx] = 1;
      loop.pts.push([cx + 0.5, cy + 0.5]);
    }
    edges.push(loop);
  }
  return { edges, nodeCount: kind.length, nodeKind: kind };
}

const len = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/** Remove short spurs hanging off junctions, then join lines that pass straight through a node. */
function tidy(edges: Edge[], nodeCount: number, spur: number): Edge[] {
  const degree = () => {
    const deg = new Array<number>(nodeCount).fill(0);
    for (const e of edges) {
      if (e.b < 0 || e.closed) continue;
      deg[e.a]++;
      deg[e.b]++;
    }
    return deg;
  };
  let deg = degree();
  edges = edges.filter((e) => {
    if (e.closed || e.b < 0) return true;
    const endA = deg[e.a] === 1;
    const endB = deg[e.b] === 1;
    // A short line with a free end, attached to something else, is a bump in the outline.
    return !(len(e.pts) < spur && endA !== endB);
  });
  deg = degree();
  for (let node = 0; node < nodeCount; node++) {
    if (deg[node] !== 2) continue;
    const touching = edges.filter((e) => !e.closed && (e.a === node || e.b === node));
    if (touching.length === 1) {
      // Both ends of one line meet here: a closed loop.
      touching[0].closed = true;
      touching[0].pts.pop();
      continue;
    }
    if (touching.length !== 2) continue;
    const [e1, e2] = touching;
    const p1 = e1.b === node ? e1.pts : [...e1.pts].reverse();
    const p2 = e2.a === node ? e2.pts : [...e2.pts].reverse();
    const merged: Edge = { a: e1.b === node ? e1.a : e1.b, b: e2.a === node ? e2.b : e2.a, pts: [...p1, ...p2.slice(1)] };
    edges = edges.filter((e) => e !== e1 && e !== e2);
    edges.push(merged);
  }
  return edges;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = Math.hypot(dx, dy);
  let far = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dist = l ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / l : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (dist > far) {
      far = dist;
      at = i;
    }
  }
  if (far <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/**
 * Smooth a simplified polyline into path data: vertices that turn less than `cornerDeg` become
 * Catmull–Rom curve points, sharper ones stay corners, and runs between corners stay straight.
 */
function smoothPath(pts: Pt[], closed: boolean, scale: number, cornerDeg = 40): string {
  const n = pts.length;
  const P = (p: Pt) => `${fmt(p[0] * scale)} ${fmt(p[1] * scale)}`;
  if (n === 1 || (n === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1])) return `M${P(pts[0])}L${P(pts[0])}`;
  const get = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const corner = pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return true;
    const a = get(i - 1);
    const b = get(i + 1);
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]);
    const t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    return (turn * 180) / Math.PI > cornerDeg;
  });
  const tangent = (i: number, out: boolean): Pt => {
    const p = get(i);
    if (corner[(i + n) % n]) {
      const q = out ? get(i + 1) : get(i - 1);
      return out ? [q[0] - p[0], q[1] - p[1]] : [p[0] - q[0], p[1] - q[1]];
    }
    const a = get(i - 1);
    const b = get(i + 1);
    return [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2];
  };
  let d = `M${P(pts[0])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = get(i);
    const b = get(i + 1);
    if (corner[i] && corner[(i + 1) % n]) {
      d += `L${P(b)}`;
      continue;
    }
    const ta = tangent(i, true);
    const tb = tangent(i + 1, false);
    d += `C${P([a[0] + ta[0] / 3, a[1] + ta[1] / 3])} ${P([b[0] - tb[0] / 3, b[1] - tb[1] / 3])} ${P(b)}`;
  }
  return closed ? d + 'Z' : d;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Trace an n×n ink mask (1 = ink) as centerlines, or return null if it isn't made of even lines. */
export function centerline(mask: Uint8Array, n: number, opts: CenterlineOptions = {}): CenterlineResult | null {
  const viewBox = opts.viewBox ?? 24;
  const scale = viewBox / n;
  const clean = mask.slice();
  // Drop specks.
  const minArea = Math.max(8, Math.round((n * n) / 4000));
  const shapes = components(clean, n).filter((c) => {
    if (c.length >= minArea) return true;
    for (const j of c) clean[j] = 0;
    return false;
  });
  if (!shapes.length) return null;

  const dist = distanceTransform(clean, n);
  const sk = thin(clean, n);
  // Thinning erases solid discs entirely. A shape with (almost) no skeleton left is a dot if its
  // area matches a circle of its radius; any other solid shape means this isn't line work.
  const dots: CenterlineResult['dots'] = [];
  const inDot = new Uint8Array(n * n);
  for (const c of shapes) {
    const bones = c.filter((j) => sk[j]);
    if (bones.length > 2) continue;
    let far = 0;
    let at = c[0];
    for (const j of c) if (dist[j] > far) [far, at] = [dist[j], j];
    const circle = Math.PI * far * far;
    // Dots are small (a wheel, the dot of an "i"); a big solid disc is a filled shape.
    if (Math.abs(c.length - circle) / circle > 0.3 || far * scale > 3.5) return null;
    const x = at % n;
    dots.push({ x: (x + 0.5) * scale, y: ((at - x) / n + 0.5) * scale, r: far * scale });
    for (const j of c) {
      inDot[j] = 1;
      sk[j] = 0;
    }
  }

  const along: number[] = [];
  for (let i = 0; i < n * n; i++) if (sk[i]) along.push(dist[i]);
  if (!along.length) return dots.length ? { d: '', dots, width: 0, fit: 1 } : null;
  const half = median(along);
  if (half < 0.75) return null;
  const widthPx = 2 * half - 0.5;

  // Redraw the skeleton as discs of the measured width and compare with the ink.
  const r = widthPx / 2;
  const redrawn = new Uint8Array(n * n);
  const ri = Math.ceil(r);
  for (let i = 0; i < n * n; i++) {
    if (!sk[i]) continue;
    const x = i % n;
    const y = (i - x) / n;
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) redrawn[ny * n + nx] = 1;
      }
  }
  let both = 0;
  let either = 0;
  for (let i = 0; i < n * n; i++) {
    if (inDot[i]) continue;
    if (redrawn[i] && clean[i]) both++;
    if (redrawn[i] || clean[i]) either++;
  }
  const fit = either ? both / either : 0;
  if (fit < (opts.minFit ?? 0.72)) return null;

  const { edges, nodeCount } = skeletonGraph(sk, n);
  // Spurs from bumps in an outline are shorter than half a line width; real stubs are longer.
  const lines = tidy(edges, nodeCount, Math.max(3, widthPx * 0.55));
  const eps = Math.max(0.8, n / 220);
  const d = lines
    .filter((e) => e.pts.length)
    .map((e) => {
      const pts = e.closed ? simplifyClosed(e.pts, eps) : simplify(e.pts, eps);
      return smoothPath(pts, !!e.closed && pts.length > 2, scale);
    })
    .join('');
  return d || dots.length ? { d, dots, width: widthPx * scale, fit } : null;
}

/** RDP for a closed loop: split at the point furthest from the start so both halves have ends. */
function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts;
  let far = 0;
  let at = 0;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
    if (d > far) {
      far = d;
      at = i;
    }
  });
  const a = simplify(pts.slice(0, at + 1), eps);
  const b = simplify([...pts.slice(at), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
