import JSZip from 'jszip';
import { svgToEmf } from './emf';
import { indicatorFiles, INDICATOR_KINDS, type IndicatorKind } from './indicators';
import { BUTTON_STATES, buttonState, glyph, labviewGuide, STATUS, statusVariant, viIcon } from './labview';
import { opticalSvg, snapSvg, WEIGHTS } from './paths';
import { styleLock } from './prompts';
import { componentName, figmaSheet, fileName, reactComponent, sprite, uniqueNames, withCurrentColor, withTitle } from './svg';
import type { ExportOptions, ExportTarget, IconItem, Project } from './types';

export const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
export const PNG_SCALES = [1, 1.5, 2];
export const BUTTON_SIZES = [32, 48, 64];
/** Pixel size of status-variant PNGs when plain PNG export is off. */
export const STATE_SIZE = 48;
/** Largest PNG that gets pixel-grid snapping; above this, anti-aliasing already looks sharp. */
const SNAP_MAX = 64;

type FormatKeys = 'svg' | 'png' | 'react' | 'sprite' | 'figma' | 'emf' | 'buttons' | 'viIcons' | 'states' | 'indicators';

export const TARGETS: { id: ExportTarget; label: string; hint: string; files: Partial<Record<FormatKeys, true>> & { pngSizes?: number[]; pngScales?: number[] } }[] = [
  { id: 'labview', label: 'LabVIEW', hint: 'Button states, VI icons, EMF and @2x PNGs', files: { png: true, emf: true, buttons: true, viIcons: true, pngSizes: [16, 32], pngScales: [1, 2] } },
  { id: 'hmi', label: 'HMI / SCADA', hint: 'Equipment states, alarm badges and indicators', files: { svg: true, png: true, states: true, indicators: true, pngSizes: [24, 48] } },
  { id: 'web', label: 'Web & apps', hint: 'SVG, React components and PNGs', files: { svg: true, react: true, png: true, pngSizes: [24, 48] } },
  { id: 'design', label: 'Design tools', hint: 'Figma layers and large PNGs', files: { svg: true, figma: true, png: true, pngSizes: [512] } },
];

/**
 * The formats for a set of targets: everything any of them needs, nothing else. Settings that
 * aren't about which files to make (names, colours, banner, skins) are kept as they are.
 */
export function applyTargets(o: ExportOptions, targets: ExportTarget[]): ExportOptions {
  const picked = TARGETS.filter((t) => targets.includes(t.id));
  const on = (k: FormatKeys) => picked.some((t) => t.files[k]);
  const sizes = [...new Set(picked.flatMap((t) => t.files.pngSizes ?? []))].sort((a, b) => a - b);
  const scales = [...new Set([1, ...picked.flatMap((t) => t.files.pngScales ?? [])])].sort((a, b) => a - b);
  return {
    ...o,
    targets,
    svg: on('svg') || !picked.length,
    png: on('png'),
    react: on('react'),
    sprite: on('sprite'),
    figma: on('figma'),
    emf: on('emf'),
    buttons: on('buttons'),
    viIcons: on('viIcons'),
    states: on('states'),
    indicators: on('indicators'),
    pngSizes: sizes.length ? sizes : o.pngSizes,
    pngScales: scales,
  };
}

/** An icon as it will be drawn at `px` pixels: the set's line weight, optical sizing and snapping. */
export function iconAt(project: Project, o: ExportOptions, svg: string, px = 24): string {
  const weighted = opticalSvg(svg, px, WEIGHTS[project.style.weight ?? 'regular']);
  return o.pixelSnap && project.style.style !== 'pixel' && px <= SNAP_MAX ? snapSvg(weighted, px) : weighted;
}

/** Button drawing options from the export settings. */
export function buttonOptions(project: Project, o: ExportOptions) {
  return { skin: o.buttonSkin, shape: o.buttonShape, primary: project.style.primary, stateColor: o.stateColor || undefined };
}

export function exportable(icons: IconItem[]): IconItem[] {
  return icons.filter((i) => i.svg);
}

type Rasterize = (svg: string, size: number) => Promise<Uint8Array>;

interface Entry {
  path: string;
  data: () => string | Uint8Array | Promise<string | Uint8Array>;
}

const scaleSuffix = (s: number) => (s === 1 ? '' : `@${s}x`);

/** Compute a drawing once, on first use: listing files shouldn't render anything. */
function lazy<T>(make: () => T): () => T {
  let v: { value: T } | null = null;
  return () => (v ??= { value: make() }).value;
}

export function wantsLabviewGuide(o: ExportOptions): boolean {
  return o.buttons || o.viIcons || o.indicators || o.emf || o.states || o.pngScales.some((s) => s !== 1);
}

/**
 * Every file the zip will hold, with a lazy producer for each. The Export step lists the paths
 * live; buildZip runs the producers. Keeping both on one list means they can't disagree.
 */
export function exportEntries(project: Project, o: ExportOptions, rasterize: Rasterize): Entry[] {
  const icons = exportable(project.icons);
  const names = icons.map((i) => i.name);
  const files = uniqueNames(names, (n) => fileName(n, o.naming, o.prefix));
  const comps = uniqueNames(names, componentName, '');
  const scales = [1, ...o.pngScales.filter((s) => s !== 1)].sort((a, b) => a - b);
  const pixelArt = project.style.style === 'pixel';
  // Pixel art is already on an exact grid; snapping it to another would distort it.
  const png = (svg: () => string, px: number) => () => rasterize(o.pixelSnap && !pixelArt && px <= SNAP_MAX ? snapSvg(svg(), px) : svg(), px);
  const out: Entry[] = [];
  const weight = WEIGHTS[project.style.weight ?? 'regular'];
  /** The icon with the set's line weight, and optical line widths when drawn at `px` pixels. */
  const drawn = (icon: IconItem, px = 24) => opticalSvg(icon.svg!, px, weight);
  // HMI screens show equipment at 24–64 px; smaller sizes can't carry a badge.
  const stateSizes = o.png ? o.pngSizes.filter((s) => s >= 24 && s <= 64) : [];
  const buttonOpts = buttonOptions(project, o);
  /** PNG at each selected density, e.g. cart.png, cart@2x.png. */
  const pngs = (base: string, svg: () => string, size: number) =>
    scales.forEach((s) => out.push({ path: `${base}${scaleSuffix(s)}.png`, data: png(svg, Math.round(size * s)) }));

  if (o.svg) icons.forEach((icon, k) => out.push({ path: `svg/${files[k]}.svg`, data: () => withTitle(drawn(icon), icon.name) + '\n' }));
  if (o.png) o.pngSizes.forEach((size) => icons.forEach((icon, k) => pngs(`png/${size}/${files[k]}`, () => drawn(icon, size), size)));
  if (o.emf) icons.forEach((icon, k) => out.push({ path: `emf/${files[k]}.emf`, data: () => svgToEmf(drawn(icon), 32) }));
  if (o.react) {
    comps.forEach((c, k) => out.push({ path: `react/${c}.tsx`, data: () => reactComponent(c, drawn(icons[k])) }));
    out.push({ path: 'react/index.ts', data: () => comps.map((c) => `export { ${c} } from './${c}';`).join('\n') + '\n' });
  }
  if (o.sprite) out.push({ path: 'sprite.svg', data: () => sprite(icons.map((i, k) => ({ id: files[k], svg: withCurrentColor(drawn(i)) }))) });
  if (o.figma) out.push({ path: 'figma/icons.svg', data: () => figmaSheet(icons.map((i, k) => ({ id: files[k], svg: drawn(i) }))) });

  if (o.states) {
    const onColor = o.stateColor || undefined;
    for (const s of STATUS) {
      icons.forEach((icon, k) => {
        const base = `states/${s.id}`;
        out.push({ path: `${base}/${files[k]}.svg`, data: () => statusVariant(drawn(icon), s.id, { onColor }) + '\n' });
        for (const size of stateSizes.length ? stateSizes : [STATE_SIZE]) pngs(`${base}/${size}/${files[k]}`, () => statusVariant(drawn(icon, size), s.id, { onColor }), size);
        if (o.emf) out.push({ path: `${base}/${files[k]}.emf`, data: () => svgToEmf(statusVariant(drawn(icon), s.id, { onColor }), STATE_SIZE) });
      });
    }
  }
  if (o.buttons) {
    icons.forEach((icon, k) => {
      for (const state of BUTTON_STATES) {
        const svg = lazy(() => buttonState(drawn(icon), state, buttonOpts));
        const base = `labview/buttons/${files[k]}/${state}`;
        pngs(base, svg, o.buttonSize);
        if (o.emf) out.push({ path: `${base}.emf`, data: () => svgToEmf(svg(), o.buttonSize) });
      }
    });
  }
  if (o.viIcons) {
    const banner = { banner: o.bannerText, bannerColor: o.bannerColor || undefined, pixel: pixelArt };
    icons.forEach((icon, k) => {
      out.push({ path: `labview/vi-icons/${files[k]}.png`, data: png(() => viIcon(drawn(icon, 20), banner), 32) });
      out.push({ path: `labview/glyphs/${files[k]}.png`, data: png(() => glyph(drawn(icon, 28), pixelArt), 32) });
    });
  }
  if (o.indicators) {
    const kinds = o.indicatorKinds.filter((k): k is IndicatorKind => INDICATOR_KINDS.some((x) => x.id === k));
    for (const kind of kinds) {
      for (const color of o.indicatorColors) {
        for (const f of indicatorFiles(kind, color)) {
          const base = `labview/indicators/${f.name}`;
          out.push({ path: `${base}.svg`, data: () => f.svg + '\n' });
          pngs(base, () => f.svg, o.indicatorSize);
          if (o.emf) out.push({ path: `${base}.emf`, data: () => svgToEmf(f.svg, o.indicatorSize) });
        }
      }
    }
  }
  if (wantsLabviewGuide(o)) out.push({ path: 'labview/README.md', data: () => labviewGuide(o) });

  out.push({
    path: 'brand.json',
    data: () =>
      JSON.stringify(
        {
          name: project.brand.name,
          palette: project.brand.palette,
          style: project.style,
          prompt: styleLock(project.style, project.brand),
          icons: icons.map((i, k) => ({ name: i.name, file: files[k], component: comps[k] })),
          generator: 'AIconify',
        },
        null,
        2,
      ) + '\n',
  });
  out.push({ path: 'README.md', data: () => readme(project, icons, files, comps, o) });

  // Two indicator colours can collapse to one slug; keep the first file for each path.
  const byPath = new Map<string, Entry>();
  for (const e of out) if (!byPath.has(e.path)) byPath.set(e.path, e);
  return [...byPath.values()];
}

/** The file list a zip will contain — shown live in the Export step. */
export function planFiles(project: Project, o: ExportOptions): string[] {
  return exportEntries(project, o, async () => new Uint8Array()).map((e) => e.path);
}

export async function buildZip(project: Project, o: ExportOptions, rasterize: Rasterize): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const e of exportEntries(project, o, rasterize)) zip.file(e.path, await e.data());
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function readme(project: Project, icons: IconItem[], files: string[], comps: string[], o: ExportOptions): string {
  const example = (icons[0]?.name ?? 'Icon').replace(/["{}<>]/g, '');
  const title = project.brand.name ? `${project.brand.name} icons` : 'Icon set';
  const lines = [`# ${title}`, '', `${files.length} icons, 24×24 viewBox. Generated with AIconify.`, ''];
  if (o.svg) lines.push('## SVG', '', '```html', `<img src="svg/${files[0] ?? 'icon'}.svg" width="24" height="24" alt="">`, '```', '');
  if (o.react)
    lines.push('## React', '', 'Copy `react/` into your project.', '', '```tsx', `import { ${comps[0] ?? 'Icon'} } from './react';`, '', `<${comps[0] ?? 'Icon'} size={24} title="${example}" />`, '```', '');
  if (o.sprite)
    lines.push('## Sprite', '', 'Inline `sprite.svg` once in your page, then:', '', '```html', `<svg width="24" height="24"><use href="#${files[0] ?? 'icon'}"/></svg>`, '```', '');
  if (wantsLabviewGuide(o)) lines.push('## LabVIEW', '', 'See `labview/README.md` for importing buttons, VI icons, indicators and EMF files.', '');
  return lines.join('\n');
}
