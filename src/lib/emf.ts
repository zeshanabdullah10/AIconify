import ClipperLib from 'clipper-lib';
import { hexToRgb, isHex } from './color';
import { parseD, parseSvg, type FillPath } from './paths';

/**
 * Enhanced Metafile (EMF) writer for our own SVGs. EMF is the vector format Windows apps, LabVIEW
 * included, can place and scale without blurring.
 *
 * Players differ a lot in what they support, so the file uses only the most basic records:
 * solid brushes and filled polygons. Curves are flattened, stroked lines become their exact
 * outline (with joins and caps) instead of relying on GDI paths and geometric pens, and every
 * shape is merged into non-overlapping polygons, so the even-odd and winding fill rules draw the
 * same thing. Every drawing record carries correct bounds.
 */

const EMR = {
  HEADER: 1,
  POLYPOLYGON: 8,
  SETWINDOWEXTEX: 9,
  SETWINDOWORGEX: 10,
  SETVIEWPORTEXTEX: 11,
  SETVIEWPORTORGEX: 12,
  EOF: 14,
  SETMAPMODE: 17,
  SETBKMODE: 18,
  SETPOLYFILLMODE: 19,
  SELECTOBJECT: 37,
  CREATEBRUSHINDIRECT: 39,
  DELETEOBJECT: 40,
} as const;

const MM_ANISOTROPIC = 8;
const TRANSPARENT = 1;
const ALTERNATE = 1;
const NULL_PEN = 0x80000008;
const NULL_BRUSH = 0x80000005;
/** Logical units per viewBox unit: keeps two decimals of precision in integer coordinates. */
const SCALE = 100;

type Pt = [number, number];

class Writer {
  private chunks: Uint8Array[] = [];
  records = 0;
  bytes = 0;

  record(type: number, ...ints: number[]) {
    const size = 8 + ints.length * 4;
    const buf = new DataView(new ArrayBuffer(size));
    buf.setUint32(0, type, true);
    buf.setUint32(4, size, true);
    ints.forEach((v, i) => buf.setInt32(8 + i * 4, v, true));
    this.chunks.push(new Uint8Array(buf.buffer));
    this.records++;
    this.bytes += size;
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.bytes);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/* ---------- geometry ---------- */

/** A path's subpaths as polylines, with curves flattened. */
export function flattenPath(d: string): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let line: Pt[] = [];
  let cur: Pt = [0, 0];
  const flush = (closed: boolean) => {
    const pts = line.filter((p, i) => !i || Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) > 1e-6);
    if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]) < 1e-6) pts.pop();
    if (pts.length) out.push({ pts, closed });
    line = [];
  };
  for (const s of parseD(d)) {
    if (s.c === 'M') {
      if (line.length) flush(false);
      cur = [s.p[0], s.p[1]];
      line = [cur];
    } else if (s.c === 'L') {
      cur = [s.p[0], s.p[1]];
      line.push(cur);
    } else if (s.c === 'Q' || s.c === 'C') {
      const [x0, y0] = cur;
      const ctrl = s.c === 'Q' ? [[x0, y0], [s.p[0], s.p[1]], [s.p[2], s.p[3]]] : [[x0, y0], [s.p[0], s.p[1]], [s.p[2], s.p[3]], [s.p[4], s.p[5]]];
      // Enough steps that the chord error stays well under a hundredth of the icon.
      let len = 0;
      for (let i = 1; i < ctrl.length; i++) len += Math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]);
      const steps = Math.max(4, Math.min(32, Math.ceil(len)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        if (s.c === 'Q') {
          line.push([u * u * x0 + 2 * u * t * s.p[0] + t * t * s.p[2], u * u * y0 + 2 * u * t * s.p[1] + t * t * s.p[3]]);
        } else {
          const [ax, ay, bx, by, x, y] = s.p;
          line.push([u ** 3 * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * x, u ** 3 * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * y]);
        }
      }
      cur = line[line.length - 1];
    } else {
      const start = line[0] ?? cur;
      flush(true);
      cur = start;
      line = [];
    }
  }
  if (line.length) flush(false);
  return out;
}

/** Clipper works in integers: 1/1000 of a viewBox unit. */
const CL = 1000;
const toCl = (poly: Pt[]) => poly.map(([x, y]) => ({ X: Math.round(x * CL), Y: Math.round(y * CL) }));
const fromCl = (paths: { X: number; Y: number }[][]): Pt[][] => paths.filter((p) => p.length > 2).map((p) => p.map((q) => [q.X / CL, q.Y / CL] as Pt));

/**
 * The outline of a stroked path: the exact area the line covers, as non-overlapping polygons with
 * holes (the inside of a ring is a hole, not an overlap). Round lines get round joins and ends;
 * square ones mitred joins and square ends. Because nothing overlaps, it draws the same under
 * either fill rule, which matters: some EMF players ignore the winding rule.
 */
export function strokeOutline(d: string, width: number, cap: 'round' | 'square' = 'round'): Pt[][] {
  const r = width / 2;
  const off = new ClipperLib.ClipperOffset(4, 0.002 * CL);
  const join = cap === 'round' ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter;
  for (const { pts, closed } of flattenPath(d)) {
    // A lone point is a dot: give it a length Clipper can offset.
    const path = pts.length === 1 ? [pts[0], [pts[0][0] + 1e-3, pts[0][1]] as Pt] : pts;
    const end = closed && path.length > 2 ? ClipperLib.EndType.etClosedLine : cap === 'round' ? ClipperLib.EndType.etOpenRound : ClipperLib.EndType.etOpenSquare;
    off.AddPath(toCl(path), join, end);
  }
  const out: { X: number; Y: number }[][] = [];
  off.Execute(out, r * CL);
  return fromCl(out);
}

/** A filled path's own subpaths, merged into non-overlapping polygons (nonzero rule, like SVG). */
function fillOutline(d: string): Pt[][] {
  const polys = flattenPath(d).filter((sp) => sp.pts.length > 2).map((sp) => toCl(sp.pts));
  if (!polys.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(polys, ClipperLib.PolyType.ptSubject, true);
  const out: { X: number; Y: number }[][] = [];
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromCl(out);
}

/** The polygons a path fills: its own subpaths for a fill, the expanded outline for a stroke. */
export function pathPolygons(p: FillPath): Pt[][] {
  return p.stroke ? strokeOutline(p.d, p.width ?? 1, p.cap ?? 'round') : fillOutline(p.d);
}

/* ---------- writer ---------- */

/** Convert an SVG made by this app to EMF, with a nominal size of `px` pixels at 96 dpi. */
export function svgToEmf(svg: string, px = 32): Uint8Array {
  const { width, height, paths } = parseSvg(svg);
  const w = Math.max(1, Math.round(px));
  const h = Math.max(1, Math.round((px * height) / width));
  const body = new Writer();
  const P = (v: number) => Math.round(v * SCALE);
  // Record bounds are in device pixels, inclusive.
  const dev = (xs: number[], ys: number[]) => [
    Math.max(0, Math.floor((Math.min(...xs) * w) / width)),
    Math.max(0, Math.floor((Math.min(...ys) * h) / height)),
    Math.min(w - 1, Math.ceil((Math.max(...xs) * w) / width)),
    Math.min(h - 1, Math.ceil((Math.max(...ys) * h) / height)),
  ];

  body.record(EMR.SETMAPMODE, MM_ANISOTROPIC);
  body.record(EMR.SETWINDOWORGEX, 0, 0);
  body.record(EMR.SETWINDOWEXTEX, P(width), P(height));
  body.record(EMR.SETVIEWPORTORGEX, 0, 0);
  body.record(EMR.SETVIEWPORTEXTEX, w, h);
  body.record(EMR.SETBKMODE, TRANSPARENT);
  body.record(EMR.SETPOLYFILLMODE, ALTERNATE);
  // Shapes are filled only: no outline pen anywhere.
  body.record(EMR.SELECTOBJECT, NULL_PEN);

  for (const path of paths) {
    const color = path.stroke ?? path.fill;
    if (!isHex(color)) continue;
    const polys = pathPolygons(path).filter((poly) => poly.length > 2);
    if (!polys.length) continue;
    const { r, g, b } = hexToRgb(color);
    // Brush handle 1 is reused for every shape: create, select, fill, deselect, delete.
    body.record(EMR.CREATEBRUSHINDIRECT, 1, 0 /* BS_SOLID */, r | (g << 8) | (b << 16), 0);
    body.record(EMR.SELECTOBJECT, 1);
    const all = polys.flat();
    body.record(
      EMR.POLYPOLYGON,
      ...dev(all.map((p) => p[0]), all.map((p) => p[1])),
      polys.length,
      all.length,
      ...polys.map((poly) => poly.length),
      ...all.flatMap(([x, y]) => [P(x), P(y)]),
    );
    body.record(EMR.SELECTOBJECT, NULL_BRUSH);
    body.record(EMR.DELETEOBJECT, 1);
  }

  const eof = new Writer();
  eof.record(EMR.EOF, 0, 16, 20);

  const HEADER_SIZE = 108;
  const header = new DataView(new ArrayBuffer(HEADER_SIZE));
  const i32 = (at: number, v: number) => header.setInt32(at, v, true);
  const u32 = (at: number, v: number) => header.setUint32(at, v, true);
  u32(0, EMR.HEADER);
  u32(4, HEADER_SIZE);
  // rclBounds: device pixels, inclusive
  i32(8, 0);
  i32(12, 0);
  i32(16, w - 1);
  i32(20, h - 1);
  // rclFrame: 0.01 mm, inclusive, at 96 dpi
  const mm100 = (v: number) => Math.round((v * 2540) / 96);
  i32(24, 0);
  i32(28, 0);
  i32(32, mm100(w) - 1);
  i32(36, mm100(h) - 1);
  u32(40, 0x464d4520); // " EMF"
  u32(44, 0x10000);
  u32(48, HEADER_SIZE + body.bytes + eof.bytes);
  u32(52, 1 + body.records + eof.records);
  header.setUint16(56, 2, true); // handles: index 0 is reserved, 1 is our brush
  header.setUint16(58, 0, true);
  u32(60, 0); // no description
  u32(64, 0);
  u32(68, 0); // no palette
  // Reference device: 1920×1080 px on a 508×286 mm screen (96 dpi)
  i32(72, 1920);
  i32(76, 1080);
  i32(80, 508);
  i32(84, 286);
  u32(88, 0); // cbPixelFormat
  u32(92, 0); // offPixelFormat
  u32(96, 0); // bOpenGL
  i32(100, 508000); // szlMicrometers
  i32(104, 286000);

  const out = new Uint8Array(HEADER_SIZE + body.bytes + eof.bytes);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(body.concat(), HEADER_SIZE);
  out.set(eof.concat(), HEADER_SIZE + body.bytes);
  return out;
}

/** Walk an EMF's records. Used by tests to check the file is well formed. */
export function emfRecords(bytes: Uint8Array): { type: number; size: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: number; size: number }[] = [];
  for (let at = 0; at < bytes.length; ) {
    const type = view.getUint32(at, true);
    const size = view.getUint32(at + 4, true);
    if (size < 8 || size % 4 || at + size > bytes.length) throw new Error(`Bad EMF record at ${at}`);
    out.push({ type, size });
    at += size;
  }
  return out;
}

/**
 * Read back the filled polygons of an EMF this module wrote, as an SVG in the same viewBox. Tests
 * compare it with the source SVG to prove the metafile draws the same picture.
 */
export function emfToSvg(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const i32 = (at: number) => view.getInt32(at, true);
  let win: Pt = [1, 1];
  let brush = '';
  const out: string[] = [];
  for (let at = 0; at < bytes.length; ) {
    const type = view.getUint32(at, true);
    const size = view.getUint32(at + 4, true);
    if (type === EMR.SETWINDOWEXTEX) win = [i32(at + 8), i32(at + 12)];
    if (type === EMR.CREATEBRUSHINDIRECT) {
      const c = view.getUint32(at + 16, true);
      brush = '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
    }
    if (type === EMR.POLYPOLYGON) {
      const n = i32(at + 24);
      let p = at + 32 + n * 4;
      let d = '';
      for (let k = 0; k < n; k++) {
        const count = i32(at + 32 + k * 4);
        for (let q = 0; q < count; q++, p += 8) d += `${q ? 'L' : 'M'}${i32(p) / SCALE} ${i32(p + 4) / SCALE}`;
        d += 'Z';
      }
      out.push(`<path fill="${brush}" d="${d}"/>`);
    }
    at += size;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${win[0] / SCALE} ${win[1] / SCALE}">${out.join('')}</svg>`;
}
