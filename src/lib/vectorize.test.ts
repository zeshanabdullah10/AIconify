import { GREEN, fillCircle } from '../test/fixtures';
import { createRaster } from './raster';
import { pixelize, quantize, vectorize } from './vectorize';
import { parseSvg } from './paths';

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

  it('traces pixels in the part key as the active part, in its display colour', () => {
    const img = ring();
    fillCircle(img, 64, 64, 22, [250, 10, 245, 255]); // a near-magenta hub the model drew
    const svg = vectorize(img, { palette: ['#1f4d3a', '#ff00ff'], traceSize: 256, active: { key: '#ff00ff', color: '#6bbf59' } });
    const paths = [...svg.matchAll(/<path ([^>]*)\/>/g)].map((m) => m[1]);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/^fill="#1f4d3a"/);
    expect(paths[1]).toMatch(/^class="active" fill="#6bbf59"/);
    expect(svg).not.toContain('#ff00ff');
  });

  it('rebuilds pixel art on an exact 32 grid, with active parts', () => {
    const img = createRaster(256, 256);
    fillCircle(img, 128, 128, 100, GREEN);
    fillCircle(img, 128, 128, 40, [250, 10, 245, 255]);
    const svg = pixelize(img, { palette: ['#1f4d3a', '#ff00ff'], active: { key: '#ff00ff', color: '#6bbf59' } }, 32);
    const { paths } = parseSvg(svg);
    expect(paths.map((p) => p.fill)).toEqual(['#1f4d3a', '#6bbf59']);
    expect(paths[1].part).toBe('active');
    // Every coordinate is a whole grid pixel (0.75 units), inside the 2-pixel margin.
    const nums = paths.flatMap((p) => p.d.match(/-?\d*\.?\d+/g)!.map(Number));
    for (const v of nums) expect(Math.abs(v / 0.75 - Math.round(v / 0.75))).toBeLessThan(1e-6);
    expect(Math.min(...nums)).toBeCloseTo(1.5);
    expect(Math.max(...nums)).toBeCloseTo(22.5);
    // The same via vectorize's option.
    expect(vectorize(img, { palette: ['#1f4d3a'], pixel: 32 })).toContain('M');
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
