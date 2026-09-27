import { DEFAULT_MODEL } from './models';
import { uid } from './pipeline';
import type { Project } from './types';

export function defaultProject(): Project {
  return {
    id: uid(),
    brand: {
      name: '',
      notes: '',
      palette: [],
      traits: [],
      dos: [],
      donts: [],
      fonts: {},
      analyzed: false,
    },
    style: {
      style: 'outline',
      strokeWeight: 2,
      corners: 'rounded',
      colorMode: 'brand',
      primary: '#1d1d1f',
      accent: '#0071e3',
    },
    iconNames: [],
    icons: [],
    runs: [],
    modelId: DEFAULT_MODEL,
    quality: 'low',
    candidates: 2,
    exportOptions: {
      svg: true,
      png: true,
      pngSizes: [24, 48, 512],
      react: true,
      sprite: false,
      figma: true,
      naming: 'kebab',
      prefix: '',
    },
    spent: 0,
    updatedAt: Date.now(),
  };
}
