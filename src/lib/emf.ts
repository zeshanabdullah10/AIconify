import { hexToRgb, isHex } from './color';
import { parseD, parseSvg } from './paths';

/**
 * Minimal Enhanced Metafile (EMF) writer for our own filled-path SVGs. EMF is the vector format
 * Windows apps, LabVIEW included, can place and scale without blurring. Every colour becomes one
 * solid brush and one filled path; quadratic curves are raised to cubic Béziers.
 */

const EMR = {
  HEADER: 1,
  POLYBEZIERTO: 5,
  SETWINDOWEXTEX: 9,
  SETVIEWPORTEXTEX: 11,
  EOF: 14,
  SETMAPMODE: 17,
  SETPOLYFILLMODE: 19,
  MOVETOEX: 27,
  SELECTOBJECT: 37,
  CREATEBRUSHINDIRECT: 39,
  DELETEOBJECT: 40,
  LINETO: 54,
  BEGINPATH: 59,
  ENDPATH: 60,
  CLOSEFIGURE: 61,
  FILLPATH: 62,
} as const;

const MM_ANISOTROPIC = 8;
const WINDING = 2;
/** Logical units per viewBox unit: keeps two decimals of precision in integer coordinates. */
const SCALE = 100;

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
    this.push(new Uint8Array(buf.buffer));
  }

  push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.records++;
    this.bytes += bytes.length;
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

/** Convert an SVG made by this app to EMF, with a nominal size of `px` pixels at 96 dpi. */
export function svgToEmf(svg: string, px = 32): Uint8Array {
  const { width, height, paths } = parseSvg(svg);
  const w = Math.max(1, Math.round(px));
  const h = Math.max(1, Math.round((px * height) / width));
  const body = new Writer();
  const P = (v: number) => Math.round(v * SCALE);

  body.record(EMR.SETMAPMODE, MM_ANISOTROPIC);
  body.record(EMR.SETWINDOWEXTEX, P(width), P(height));
  body.record(EMR.SETVIEWPORTEXTEX, w, h);
  body.record(EMR.SETPOLYFILLMODE, WINDING);

  for (const path of paths) {
    if (!isHex(path.fill)) continue;
    const { r, g, b } = hexToRgb(path.fill);
    // Brush handle 1 is reused for every colour: create, select, fill, delete.
    body.record(EMR.CREATEBRUSHINDIRECT, 1, 0 /* BS_SOLID */, r | (g << 8) | (b << 16), 0);
    body.record(EMR.SELECTOBJECT, 1);
    body.record(EMR.BEGINPATH);
    let cur: [number, number] = [0, 0];
    let start: [number, number] = [0, 0];
    for (const seg of parseD(path.d)) {
      if (seg.c === 'M') {
        cur = start = [seg.p[0], seg.p[1]];
        body.record(EMR.MOVETOEX, P(cur[0]), P(cur[1]));
      } else if (seg.c === 'L') {
        cur = [seg.p[0], seg.p[1]];
        body.record(EMR.LINETO, P(cur[0]), P(cur[1]));
      } else if (seg.c === 'Q' || seg.c === 'C') {
        let pts: number[];
        if (seg.c === 'Q') {
          const [qx, qy, x, y] = seg.p;
          pts = [cur[0] + (2 / 3) * (qx - cur[0]), cur[1] + (2 / 3) * (qy - cur[1]), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y];
        } else {
          pts = [...seg.p];
        }
        // rclBounds (unused by readers, left zero), point count, then the three points.
        body.record(EMR.POLYBEZIERTO, 0, 0, 0, 0, 3, ...pts.map(P));
        cur = [pts[4], pts[5]];
      } else {
        body.record(EMR.CLOSEFIGURE);
        cur = start;
      }
    }
    body.record(EMR.ENDPATH);
    body.record(EMR.FILLPATH, 0, 0, P(width), P(height));
    body.record(EMR.SELECTOBJECT, 0x80000000 | 5 /* NULL_BRUSH */);
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
