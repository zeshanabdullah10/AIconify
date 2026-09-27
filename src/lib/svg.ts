import type { ExportOptions } from './types';

export function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function fileName(name: string, naming: ExportOptions['naming'], prefix = ''): string {
  const w = words(name);
  const base =
    naming === 'pascal'
      ? w.map((x) => x[0].toUpperCase() + x.slice(1)).join('')
      : w.join(naming === 'snake' ? '_' : '-');
  return `${prefix}${base || 'icon'}`;
}

export function componentName(name: string): string {
  const pascal = words(name)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join('');
  const safe = pascal || 'Icon';
  return /^[0-9]/.test(safe) ? `Icon${safe}` : safe;
}

/** Make sure every icon has a unique export name (two "Settings" icons would clobber each other). */
export function uniqueNames(names: string[], make: (n: string) => string, sep = '-'): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = make(n);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}${sep}${count + 1}` : base;
  });
}

export function pathsOf(svg: string): string {
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg);
  return m ? m[1] : '';
}

export function colorsOf(svg: string): string[] {
  return [...new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase()))];
}

/** Single-colour icons use currentColor so they inherit text colour in apps. */
export function withCurrentColor(svg: string): string {
  if (colorsOf(svg).length !== 1) return svg;
  return svg.replace(/(fill|stroke)="#[0-9a-f]{6}"/gi, '$1="currentColor"');
}

export function recolor(svg: string, map: Record<string, string>): string {
  return svg.replace(/(fill|stroke)="(#[0-9a-f]{6})"/gi, (all, attr: string, hex: string) => {
    const to = map[hex.toLowerCase()];
    return to ? `${attr}="${to}"` : all;
  });
}

/** SVG attribute names as React props. */
function jsx(markup: string): string {
  return markup
    .replace(/\bclass=/g, 'className=')
    .replace(/\b(fill-rule|stroke-width|stroke-linecap|stroke-linejoin)=/g, (_, a: string) => a.replace(/-(\w)/g, (__, c: string) => c.toUpperCase()) + '=');
}

export function withTitle(svg: string, title: string): string {
  const safe = title.replace(/[<>&"]/g, '');
  return svg.replace(/<svg([^>]*)>/, `<svg$1 role="img" aria-label="${safe}"><title>${safe}</title>`);
}

export function sprite(icons: { id: string; svg: string }[]): string {
  const symbols = icons.map(({ id, svg }) => `<symbol id="${id}" viewBox="0 0 24 24">${pathsOf(svg)}</symbol>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>\n`;
}

/** One SVG with every icon as a named group on a grid — pastes into Figma as layers. */
export function figmaSheet(icons: { id: string; svg: string }[], cols = 8, cell = 48): string {
  const groups = icons.map(({ id, svg }, i) => {
    const x = (i % cols) * cell + 12;
    const y = Math.floor(i / cols) * cell + 12;
    return `<g id="${id}" transform="translate(${x} ${y})">${pathsOf(svg)}</g>`;
  });
  const w = Math.min(icons.length, cols) * cell;
  const h = Math.ceil(icons.length / cols) * cell;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${groups.join('')}</svg>\n`;
}

export function reactComponent(name: string, svg: string): string {
  const jsxPaths = jsx(pathsOf(withCurrentColor(svg)));
  return `import type { SVGProps } from 'react';

export interface ${name}Props extends SVGProps<SVGSVGElement> {
  size?: number | string;
  title?: string;
}

export function ${name}({ size = 24, title, ...props }: ${name}Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      ${jsxPaths.replace(/\/>/g, ' />')}
    </svg>
  );
}

export default ${name};
`;
}
