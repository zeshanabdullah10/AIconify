import JSZip from 'jszip';
import { styleLock } from './prompts';
import { componentName, figmaSheet, fileName, reactComponent, sprite, uniqueNames, withCurrentColor, withTitle } from './svg';
import type { ExportOptions, IconItem, Project } from './types';

export const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

export function exportable(icons: IconItem[]): IconItem[] {
  return icons.filter((i) => i.svg);
}

/** The file list a zip will contain — shown live in the Export step. */
export function planFiles(names: string[], o: ExportOptions): string[] {
  const files = uniqueNames(names, (n) => fileName(n, o.naming, o.prefix));
  const comps = uniqueNames(names, componentName, '');
  const out: string[] = [];
  if (o.svg) files.forEach((f) => out.push(`svg/${f}.svg`));
  if (o.png) o.pngSizes.forEach((s) => files.forEach((f) => out.push(`png/${s}/${f}.png`)));
  if (o.react) {
    comps.forEach((c) => out.push(`react/${c}.tsx`));
    out.push('react/index.ts');
  }
  if (o.sprite) out.push('sprite.svg');
  if (o.figma) out.push('figma/icons.svg');
  out.push('brand.json', 'README.md');
  return out;
}

export async function buildZip(
  project: Project,
  o: ExportOptions,
  rasterize: (svg: string, size: number) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const icons = exportable(project.icons);
  const names = icons.map((i) => i.name);
  const files = uniqueNames(names, (n) => fileName(n, o.naming, o.prefix));
  const comps = uniqueNames(names, componentName, '');
  const mono = icons.map((i) => withCurrentColor(i.svg!));
  const zip = new JSZip();

  if (o.svg) icons.forEach((icon, k) => zip.file(`svg/${files[k]}.svg`, withTitle(icon.svg!, icon.name) + '\n'));
  if (o.png) {
    for (const size of o.pngSizes) {
      for (let k = 0; k < icons.length; k++) zip.file(`png/${size}/${files[k]}.png`, await rasterize(icons[k].svg!, size));
    }
  }
  if (o.react) {
    comps.forEach((c, k) => zip.file(`react/${c}.tsx`, reactComponent(c, icons[k].svg!)));
    zip.file('react/index.ts', comps.map((c) => `export { ${c} } from './${c}';`).join('\n') + '\n');
  }
  if (o.sprite) zip.file('sprite.svg', sprite(mono.map((svg, k) => ({ id: files[k], svg }))));
  if (o.figma) zip.file('figma/icons.svg', figmaSheet(icons.map((i, k) => ({ id: files[k], svg: i.svg! }))));

  zip.file(
    'brand.json',
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
  );
  zip.file('README.md', readme(project, icons, files, comps, o));
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
  return lines.join('\n');
}
