import type { Codec } from './codec';
import { findHexColors } from './color';
import { TEXT_MODEL, getModel } from './models';
import type { Client } from './openrouter';
import { extractPalette } from './palette';
import {
  brandMessages,
  briefMessages,
  editPrompt,
  parseBrand,
  parseBrief,
  parseSuggestions,
  sheetPrompt,
  styleLock,
  suggestMessages,
  variationsPrompt,
  type BrandAnalysis,
} from './prompts';
import { gridFor, sliceSheet } from './slicer';
import type { BrandKit, IconItem, Project, SheetRun, StyleLock } from './types';
import { vectorize } from './vectorize';

export interface Deps {
  client: Client;
  codec: Codec;
  /** Called with the real (or estimated) USD cost of every API call. */
  onCost: (usd: number) => void;
  onStage?: (stage: 'brief' | 'image' | 'trace', detail?: string) => void;
  signal?: AbortSignal;
}

export const MAX_PER_SHEET = 16;
const CROP = 256;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Colours an icon's pixels are allowed to snap to. */
export function iconPalette(s: StyleLock): string[] {
  if (s.style === 'badge') return [s.primary, '#ffffff'];
  if (s.style === 'duotone' && s.colorMode === 'brand') return [s.primary, s.accent];
  return [s.primary];
}

export interface ProcessedCell {
  png: string;
  svg: string;
  flags: string[];
}

export async function processSheet(
  codec: Codec,
  dataUrl: string,
  count: number,
  cols: number,
  rows: number,
  style: StyleLock,
): Promise<ProcessedCell[]> {
  const sheet = await codec.decode(dataUrl);
  const cells = sliceSheet(sheet, { cols, rows, size: CROP }).slice(0, count);
  const palette = iconPalette(style);
  return Promise.all(
    cells.map(async (cell) => {
      const svg = cell.flags.includes('missing') ? '' : traced(vectorize(cell.image, { palette }));
      // A crop that traced to nothing (only specks) is as good as an empty cell.
      const flags = svg || cell.flags.includes('missing') ? cell.flags : ['missing', ...cell.flags];
      return { png: await codec.encode(cell.image), svg, flags };
    }),
  );
}

/** The SVG, or '' when tracing produced no shapes. */
function traced(svg: string): string {
  return svg.includes('<path') ? svg : '';
}

async function writeBriefs(deps: Deps, names: string[], brand: BrandKit, lock: string): Promise<Record<string, string>> {
  try {
    const { text, cost } = await deps.client.chat(briefMessages(names, brand, lock), {
      model: TEXT_MODEL,
      json: true,
      maxTokens: 1200,
      signal: deps.signal,
    });
    deps.onCost(cost ?? 0.0003);
    return parseBrief(text, names);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // Briefs only sharpen the prompt; the sheet still works without them.
    return {};
  }
}

/** Style references: the user's own existing icons first, then icons approved in this set. */
function references(project: Project, max: number, exclude?: string): string[] {
  const uploaded = (project.references ?? []).map((r) => r.png);
  const approved = project.icons.filter((i) => i.status === 'approved' && i.png && i.id !== exclude).map((i) => i.png!);
  return [...uploaded, ...approved].slice(0, max);
}

async function requestImages(deps: Deps, project: Project, prompt: string, n: number, refs: string[]) {
  const model = getModel(project.modelId);
  const each = model.estimate[model.quality ? project.quality : 'low'];
  const calls = model.maxN >= n ? [n] : Array.from({ length: n }, () => 1);
  const out: { dataUrl: string; cost: number }[] = [];
  for (const count of calls) {
    const res = await deps.client.images({
      model: model.id,
      prompt,
      n: count,
      aspect_ratio: '1:1',
      ...(model.quality ? { quality: project.quality } : {}),
      ...(model.transparent ? { background: 'transparent', output_format: 'png' } : {}),
      ...(refs.length && model.maxRefs ? { input_references: refs.slice(0, model.maxRefs) } : {}),
      signal: deps.signal,
    });
    const cost = res.cost ?? each * res.images.length;
    deps.onCost(cost);
    for (const img of res.images) out.push({ dataUrl: img, cost: cost / res.images.length });
  }
  return out;
}

export interface GenerateResult {
  runs: SheetRun[];
  icons: IconItem[];
}

/** Brief → sheet(s) → slice → trace. New icons are returned as drafts in name order. */
export async function generateIcons(deps: Deps, project: Project, names: string[]): Promise<GenerateResult> {
  const model = getModel(project.modelId);
  const lock = styleLock(project.style, project.brand);
  deps.onStage?.('brief');
  const briefs = await writeBriefs(deps, names, project.brand, lock);
  const refs = references(project, Math.min(model.maxRefs, 4));

  const runs: SheetRun[] = [];
  const icons: IconItem[] = [];
  for (let start = 0; start < names.length; start += MAX_PER_SHEET) {
    const chunk = names.slice(start, start + MAX_PER_SHEET);
    const { cols, rows } = gridFor(chunk.length, 4);
    const prompt = sheetPrompt(
      { names: chunk, descriptions: briefs, cols, rows, transparent: model.transparent, hasReferences: refs.length > 0 && model.maxRefs > 0 },
      lock,
    );
    const sheetNo = start / MAX_PER_SHEET + 1;
    const total = Math.ceil(names.length / MAX_PER_SHEET);
    deps.onStage?.('image', total > 1 ? `Sheet ${sheetNo} of ${total}` : undefined);
    const candidates = await requestImages(deps, project, prompt, Math.max(1, project.candidates), refs);
    const run: SheetRun = {
      id: uid(),
      modelId: model.id,
      quality: project.quality,
      cols,
      rows,
      names: chunk,
      candidates,
      chosen: 0,
      createdAt: Date.now(),
    };
    runs.push(run);
    deps.onStage?.('trace');
    const cells = await processSheet(deps.codec, candidates[0].dataUrl, chunk.length, cols, rows, project.style);
    cells.forEach((cell, i) => icons.push({ ...toIcon(chunk[i], briefs[chunk[i]], cell), runId: run.id, cell: i }));
  }
  return { runs, icons };
}

export function toIcon(name: string, description: string | undefined, cell: ProcessedCell): IconItem {
  return {
    id: uid(),
    name,
    description,
    status: cell.flags.length ? 'flagged' : 'draft',
    svg: cell.svg || undefined,
    png: cell.png,
    flags: cell.flags,
    history: [],
  };
}

/** Re-slice a run using a different candidate image (no API cost). */
export async function applyCandidate(codec: Codec, project: Project, run: SheetRun, index: number): Promise<ProcessedCell[]> {
  return processSheet(codec, run.candidates[index].dataUrl, run.names.length, run.cols, run.rows, project.style);
}

export async function editIcon(deps: Deps, project: Project, icon: IconItem, instruction: string): Promise<ProcessedCell> {
  const model = getModel(project.modelId);
  const lock = styleLock(project.style, project.brand);
  const refs = model.maxRefs ? [icon.png!, ...references(project, Math.min(3, model.maxRefs - 1), icon.id)].filter(Boolean) : [];
  const prompt = refs.length
    ? editPrompt(icon.name, instruction, lock, model.transparent)
    : sheetPrompt(
        { names: [icon.name], descriptions: { [icon.name]: `${icon.description ?? ''} ${instruction}`.trim() }, cols: 1, rows: 1, transparent: model.transparent },
        lock,
      );
  const [img] = await requestImages(deps, { ...project, candidates: 1 }, prompt, 1, refs);
  const [cell] = await processSheet(deps.codec, img.dataUrl, 1, 1, 1, project.style);
  return cell;
}

export async function iconVariations(deps: Deps, project: Project, icon: IconItem): Promise<ProcessedCell[]> {
  const model = getModel(project.modelId);
  const lock = styleLock(project.style, project.brand);
  const refs = model.maxRefs ? references(project, Math.min(3, model.maxRefs), icon.id) : [];
  const prompt = variationsPrompt(icon.name, icon.description, lock, model.transparent);
  const [img] = await requestImages(deps, { ...project, candidates: 1 }, prompt, 1, refs);
  return processSheet(deps.codec, img.dataUrl, 4, 2, 2, project.style);
}

/** Re-trace every icon from its stored PNG, e.g. after the palette changed. Free. */
export async function retraceAll(codec: Codec, project: Project): Promise<IconItem[]> {
  const palette = iconPalette(project.style);
  return Promise.all(
    project.icons.map(async (icon) => {
      if (!icon.png) return icon;
      const img = await codec.decode(icon.png);
      const svg = traced(vectorize(img, { palette }));
      return svg ? { ...icon, svg } : { ...icon, svg: undefined, status: 'flagged', flags: [...new Set(['missing', ...icon.flags])] };
    }),
  );
}

/* ---------- brand analysis ---------- */

export function mergeBrand(brand: BrandKit, a: BrandAnalysis, measured: string[]): BrandKit {
  const palette = a.palette.length ? a.palette : measured.map((hex, i) => ({ role: i === 0 ? 'Primary' : `Color ${i + 1}`, hex }));
  return {
    ...brand,
    name: brand.name || a.name || '',
    palette,
    traits: a.traits.length ? a.traits : brand.traits,
    dos: a.dos.length ? a.dos : brand.dos,
    donts: a.donts.length ? a.donts : brand.donts,
    fonts: { ...brand.fonts, ...Object.fromEntries(Object.entries(a.fonts).filter(([, v]) => v)) },
    analyzed: true,
  };
}

export async function analyzeBrand(deps: Deps, brand: BrandKit, logoForModel?: string): Promise<{ brand: BrandKit; analysis: BrandAnalysis }> {
  let measured: string[] = [];
  if (brand.logo) {
    const img = await deps.codec.decode(brand.logo.dataUrl);
    measured = extractPalette(img, 6).map((s) => s.hex);
  }
  const documentColors = brand.guidelines ? findHexColors(brand.guidelines.text).slice(0, 12) : [];
  const messages = brandMessages({
    logoDataUrl: logoForModel,
    guidelinesText: brand.guidelines?.text,
    notes: brand.notes,
    logoColors: measured,
    documentColors,
  });
  let analysis: BrandAnalysis | undefined;
  // The text model occasionally returns malformed JSON; one retry costs well under a cent.
  for (let attempt = 0; !analysis; attempt++) {
    const { text, cost } = await deps.client.chat(messages, { model: TEXT_MODEL, json: true, maxTokens: 1500, signal: deps.signal });
    deps.onCost(cost ?? 0.001);
    try {
      analysis = parseBrand(text);
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
  return { brand: mergeBrand(brand, analysis, measured), analysis };
}

export async function suggestIcons(deps: Deps, brand: BrandKit, existing: string[], count = 8): Promise<string[]> {
  const { text, cost } = await deps.client.chat(suggestMessages(brand, existing, count), {
    model: TEXT_MODEL,
    json: true,
    maxTokens: 400,
    signal: deps.signal,
  });
  deps.onCost(cost ?? 0.0002);
  return parseSuggestions(text, existing).slice(0, count);
}
