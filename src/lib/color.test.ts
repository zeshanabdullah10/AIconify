import { contrastRatio, findHexColors, hexToRgb, isHex, normalizeHex, rgbToHex } from './color';
import { extractPalette } from './palette';
import { createRaster } from './raster';

describe('color', () => {
  it('normalizes hex', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('1f4d3a')).toBe('#1f4d3a');
    expect(isHex('#12345')).toBe(false);
    expect(() => normalizeHex('red')).toThrow();
  });
  it('round-trips rgb', () => {
    expect(rgbToHex(hexToRgb('#1f4d3a'))).toBe('#1f4d3a');
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
  it('finds hex codes in guideline text', () => {
    expect(findHexColors('Primary #1F4D3A, accent #6bbf59; bad #12G')).toEqual(['#1f4d3a', '#6bbf59']);
  });
});

describe('extractPalette', () => {
  it('finds the dominant logo colours', () => {
    const img = createRaster(100, 100);
    for (let i = 0; i < 100 * 100; i++) {
      const left = i % 100 < 70;
      img.data.set(left ? [31, 77, 58, 255] : [217, 119, 75, 255], i * 4);
    }
    const p = extractPalette(img, 4);
    expect(p[0].hex).toBe('#1f4d3a');
    expect(p[1].hex).toBe('#d9774b');
    expect(p).toHaveLength(2);
  });
  it('ignores transparent pixels', () => {
    expect(extractPalette(createRaster(10, 10))).toEqual([]);
  });
});
