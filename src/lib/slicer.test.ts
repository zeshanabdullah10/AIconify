import { GREEN, makeSheet, fillCircle } from '../test/fixtures';
import { createRaster, ensureTransparent, transparentShare, alphaBounds } from './raster';
import { findCuts, gridFor, labelComponents, sliceSheet } from './slicer';

describe('findCuts', () => {
  it('splits evenly spaced bands', () => {
    const p = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
    expect(findCuts(p, 3)).toEqual([4, 8]);
  });
  it('merges the narrowest gaps when there are too many bands', () => {
    const p = [1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1];
    expect(findCuts(p, 2)).toEqual([7]);
  });
  it('gives up when there are fewer bands than needed', () => {
    expect(findCuts([1, 1, 1, 1], 2)).toBeNull();
  });
});

describe('labelComponents', () => {
  it('finds separate shapes', () => {
    const img = createRaster(40, 20);
    fillCircle(img, 8, 10, 5, GREEN);
    fillCircle(img, 30, 10, 5, GREEN);
    expect(labelComponents(img).comps).toHaveLength(2);
  });
});

describe('sliceSheet', () => {
  it('cuts a transparent 4×4 sheet into 16 cells', () => {
    const cells = sliceSheet(makeSheet(), { cols: 4, rows: 4, size: 128 });
    expect(cells).toHaveLength(16);
    expect(cells[10].flags).toContain('missing');
    cells.filter((c) => c.index !== 10).forEach((c) => {
      expect(c.flags).not.toContain('missing');
      expect(c.image.width).toBe(128);
    });
  });

  it('keeps a detached dot with its icon', () => {
    const cells = sliceSheet(makeSheet(), { cols: 4, rows: 4 });
    expect(cells[5].components).toBe(2);
    expect(cells[4].components).toBe(1);
  });

  it('centers every crop with the same padding', () => {
    const cells = sliceSheet(makeSheet(), { cols: 4, rows: 4, size: 96 });
    const b = alphaBounds(cells[0].image, 8)!;
    expect(Math.max(b.w, b.h)).toBeGreaterThanOrEqual(78);
    expect(Math.max(b.w, b.h)).toBeLessThanOrEqual(82);
    expect(Math.abs(b.x + b.w / 2 - 48)).toBeLessThanOrEqual(2);
  });

  it('keys out a flat white background from opaque models', () => {
    const opaque = makeSheet(512, [255, 255, 255]);
    expect(transparentShare(opaque)).toBe(0);
    expect(transparentShare(ensureTransparent(opaque))).toBeGreaterThan(0.5);
    const cells = sliceSheet(opaque, { cols: 4, rows: 4 });
    expect(cells.filter((c) => c.flags.includes('missing'))).toHaveLength(1);
  });
});

describe('gridFor', () => {
  it('picks near-square grids', () => {
    expect(gridFor(16, 4)).toEqual({ cols: 4, rows: 4 });
    expect(gridFor(9)).toEqual({ cols: 3, rows: 3 });
    expect(gridFor(5, 4)).toEqual({ cols: 3, rows: 2 });
    expect(gridFor(1)).toEqual({ cols: 1, rows: 1 });
  });
});
