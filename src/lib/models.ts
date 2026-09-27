import type { Quality } from './types';

/** DeepSeek V4.1 Flash reads images natively, so one cheap model handles brand analysis and prompts. */
export const TEXT_MODEL = 'deepseek/deepseek-v4.1-flash';
export const TEXT_PRICE = { input: 0.035 / 1e6, output: 0.29 / 1e6 };

export interface ImageModel {
  id: string;
  label: string;
  blurb: string;
  /** Returns real alpha. Otherwise we ask for a flat white background and key it out. */
  transparent: boolean;
  maxRefs: number;
  quality: boolean;
  maxN: number;
  /** Rough USD per 1024² image incl. prompt tokens. The API response has the real figure. */
  estimate: Record<Quality, number>;
}

// Prices from OpenRouter's /images/models endpoints (September 2026).
export const IMAGE_MODELS: ImageModel[] = [
  {
    id: 'openai/gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    blurb: 'Transparent output, follows grids well, edits with references',
    transparent: true,
    maxRefs: 16,
    quality: true,
    maxN: 10,
    estimate: { low: 0.009, medium: 0.026 },
  },
  {
    id: 'openai/gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    blurb: 'Cheapest with transparency, rougher detail',
    transparent: true,
    maxRefs: 16,
    quality: true,
    maxN: 10,
    estimate: { low: 0.004, medium: 0.01 },
  },
  {
    id: 'recraft/recraft-v4.1-flash',
    label: 'Recraft V4.1 Flash',
    blurb: 'Design-tuned look, no reference images',
    transparent: false,
    maxRefs: 0,
    quality: false,
    maxN: 6,
    estimate: { low: 0.007, medium: 0.007 },
  },
  {
    id: 'black-forest-labs/flux.2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    blurb: 'Open weights (Apache 2.0), up to 4 references',
    transparent: false,
    maxRefs: 4,
    quality: false,
    maxN: 1,
    estimate: { low: 0.014, medium: 0.014 },
  },
];

export const DEFAULT_MODEL = IMAGE_MODELS[0].id;

export function getModel(id: string): ImageModel {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}

export function estimateSheets(modelId: string, quality: Quality, sheets: number, candidates: number): number {
  const m = getModel(modelId);
  return m.estimate[m.quality ? quality : 'low'] * sheets * candidates;
}

export function formatUsd(v: number): string {
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}
