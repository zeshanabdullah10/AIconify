import JSZip from 'jszip';
import { svgToEmf } from './emf';
import { indicatorFiles, INDICATOR_KINDS, type IndicatorKind } from './indicators';
import { BUTTON_STATES, buttonState, glyph, labviewGuide, STATUS, statusVariant, viIcon } from './labview';
import { snapSvg } from './paths';
import { styleLock } from './prompts';
import { componentName, figmaSheet, fileName, reactComponent, sprite, uniqueNames, withCurrentColor, withTitle } from './svg';
import type { ExportOptions, IconItem, Project } from './types';

export const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
export const PNG_SCALES = [1, 1.5, 2];
export const BUTTON_SIZES = [32, 48, 64];
/** Pixel size of status-variant PNGs. */
export const STATE_SIZE = 48;
/** Largest PNG that gets pixel-grid snapping; above this, anti-aliasing already looks sharp. */
const SNAP_MAX = 64;

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
  const png = (svg: () => string, px: number) => () => rasterize(o.pixelSnap && px <= SNAP_MAX ? snapSvg(svg(), px) : svg(), px);
  const out: Entry[] = [];
  /** PNG at each selected density, e.g. cart.png, cart@2x.png. */
  const pngs = (base: string, svg: () => string, size: number) =>
    scales.forEach((s) => out.push({ path: `${base}${scaleSuffix(s)}.png`, data: png(svg, Math.round(size * s)) }));

  if (o.svg) icons.forEach((icon, k) => out.push({ path: `svg/${files[k]}.svg`, data: () => withTitle(icon.svg!, icon.name) + '\n' }));
  if (o.png) o.pngSizes.forEach((size) => icons.forEach((icon, k) => pngs(`png/${size}/${files[k]}`, () => icon.svg!, size)));
  if (o.emf) icons.forEach((icon, k) => out.push({ path: `emf/${files[k]}.emf`, data: () => svgToEmf(icon.svg!, 32) }));
  if (o.react) {
    comps.forEach((c, k) => out.push({ path: `react/${c}.tsx`, data: () => reactComponent(c, icons[k].svg!) }));
    out.push({ path: 'react/index.ts', data: () => comps.map((c) => `export { ${c} } from './${c}';`).join('\n') + '\n' });
  }
  if (o.sprite) out.push({ path: 'sprite.svg', data: () => sprite(icons.map((i, k) => ({ id: files[k], svg: withCurrentColor(i.svg!) }))) });
  if (o.figma) out.push({ path: 'figma/icons.svg', data: () => figmaSheet(icons.map((i, k) => ({ id: files[k], svg: i.svg! }))) });

  if (o.states) {
    for (const s of STATUS) {
      icons.forEach((icon, k) => {
        const svg = lazy(() => statusVariant(icon.svg!, s.id));
        const base = `states/${s.id}/${files[k]}`;
        out.push({ path: `${base}.svg`, data: () => svg() + '\n' });
        pngs(base, svg, STATE_SIZE);
        if (o.emf) out.push({ path: `${base}.emf`, data: () => svgToEmf(svg(), STATE_SIZE) });
      });
    }
  }
  if (o.buttons) {
    icons.forEach((icon, k) => {
      for (const state of BUTTON_STATES) {
        const svg = lazy(() => buttonState(icon.svg!, state, project.style.primary));
        const base = `labview/buttons/${files[k]}/${state}`;
        pngs(base, svg, o.buttonSize);
        if (o.emf) out.push({ path: `${base}.emf`, data: () => svgToEmf(svg(), o.buttonSize) });
      }
    });
  }
  if (o.viIcons) {
    const banner = { banner: o.bannerText, bannerColor: o.bannerColor || undefined };
    icons.forEach((icon, k) => {
      out.push({ path: `labview/vi-icons/${files[k]}.png`, data: png(() => viIcon(icon.svg!, banner), 32) });
      out.push({ path: `labview/glyphs/${files[k]}.png`, data: png(() => glyph(icon.svg!), 32) });
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
