import { GREEN, fillCircle } from '../test/fixtures';
import { createRaster } from './raster';
import { quantize, vectorize } from './vectorize';

describe('vectorize', () => {
  const ring = () => {
    const img = createRaster(128, 128);
    fillCircle(img, 64, 64, 50, GREEN, 12);
    return img;
  };

  it('produces a 24×24 SVG using only palette colours', () => {
    const svg = vectorize(ring(), { palette: ['#1f4d3a'], traceSize: 256 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24">/);
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect([...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map((m) => m[1])).toEqual(['#1f4d3a']);
  });

  it('scales coordinates into the 24 unit box', () => {
    const svg = vectorize(ring(), { palette: ['#1f4d3a'], traceSize: 256 });
    const nums = [...svg.matchAll(/d="([^"]+)"/g)].flatMap((m) => m[1].match(/-?\d*\.?\d+/g)!.map(Number));
    expect(Math.max(...nums)).toBeLessThanOrEqual(24);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
  });

  it('keeps the hole of a ring', () => {
    const svg = vectorize(ring(), { palette: ['#1f4d3a'], traceSize: 256 });
    // outer contour + hole contour in one path
    expect((svg.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('returns an empty svg for a blank image', () => {
    expect(vectorize(createRaster(64, 64), { palette: ['#000000'], traceSize: 64 })).not.toContain('<path');
  });
});

describe('quantize', () => {
  it('snaps colours to the nearest palette entry and drops soft alpha', () => {
    const img = createRaster(2, 1);
    img.data.set([200, 30, 30, 255, 10, 10, 10, 60]);
    const q = quantize(img, ['#ff0000', '#000000']);
    expect([...q.data]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
  });
});
