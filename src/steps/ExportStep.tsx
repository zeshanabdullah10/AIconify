import { useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Button, Card, CardHeader, Switch, TextField, cx } from '../components/ui';
import { buildZip, exportable, planFiles, PNG_SIZES } from '../lib/exporter';
import { formatUsd } from '../lib/models';
import { fileName } from '../lib/svg';
import type { ExportOptions } from '../lib/types';
import { errorText, useStore } from '../store';

export function ExportStep({ onReset }: { onReset: () => void }) {
  const { project, update, codec, notify } = useStore();
  const o = project.exportOptions;
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ExportOptions>) => update((p) => ({ ...p, exportOptions: { ...p.exportOptions, ...patch } }));
  const icons = exportable(project.icons);
  const unapproved = icons.filter((i) => i.status !== 'approved').length;
  const files = planFiles(icons.map((i) => i.name), o);
  const zipName = `${fileName(project.brand.name || 'icons', 'kebab')}-icons.zip`;

  const run = async () => {
    setBusy(true);
    try {
      const bytes = await buildZip(project, o, codec.rasterizeSvg);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify(`Downloaded ${zipName}.`, 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StepHeader eyebrow="Step 5 of 5" title="Take it everywhere." subtitle="Pick the formats your team uses. Everything comes in one zip, ready for code and design tools." />
      <div className="grid lg:grid-cols-[1fr_400px] gap-5 items-start">
        <Card className="p-5 sm:p-6 flex flex-col gap-2">
          <CardHeader title="Formats" />
          <div className="divide-y divide-line -mt-2">
            <Switch label="SVG" detail="Clean vector files, 24×24 viewBox" checked={o.svg} onChange={(v) => set({ svg: v })} />
            <Switch label="PNG" detail="Transparent, at the sizes below" checked={o.png} onChange={(v) => set({ png: v })} />
            <Switch label="React components" detail="Typed .tsx with size and title props" checked={o.react} onChange={(v) => set({ react: v })} />
            <Switch label="SVG sprite" detail="One file for <use href>" checked={o.sprite} onChange={(v) => set({ sprite: v })} />
            <Switch label="Figma" detail="One SVG with a named layer per icon" checked={o.figma} onChange={(v) => set({ figma: v })} />
          </div>
          {o.png ? (
            <div className="pt-4">
              <h3 className="text-[13px] font-medium text-ink-2 mb-2">PNG sizes</h3>
              <div role="group" aria-label="PNG sizes" className="flex flex-wrap gap-2">
                {PNG_SIZES.map((s) => {
                  const on = o.pngSizes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ pngSizes: on ? o.pngSizes.filter((x) => x !== s) : [...o.pngSizes, s].sort((a, b) => a - b) })}
                      className={cx('h-9 min-w-14 px-3 rounded-full text-[13px] font-mono tabular-nums cursor-pointer transition-colors', on ? 'bg-ink text-canvas' : 'bg-fill text-ink hover:bg-fill-2')}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid sm:grid-cols-2 gap-4 pt-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="naming" className="text-[13px] font-medium text-ink-2">
                File names
              </label>
              <select
                id="naming"
                value={o.naming}
                onChange={(e) => set({ naming: e.target.value as ExportOptions['naming'] })}
                className="h-11 rounded-[12px] bg-fill px-3 text-[15px] outline-none border border-transparent focus:border-accent"
              >
                <option value="kebab">kebab-case · coffee-cup.svg</option>
                <option value="pascal">PascalCase · CoffeeCup.svg</option>
                <option value="snake">snake_case · coffee_cup.svg</option>
              </select>
            </div>
            <TextField label="Prefix" value={o.prefix} onChange={(v) => set({ prefix: v.replace(/[^A-Za-z0-9_-]/g, '') })} placeholder="e.g. fl-" />
          </div>
        </Card>

        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <Card className="p-5 bg-ink! text-canvas">
            <div className="flex items-center mb-3">
              <span className="flex-1 text-[14px] font-semibold truncate">{zipName}</span>
              <span className="text-[12px] font-mono opacity-60">{files.length} files</span>
            </div>
            <ul className="font-mono text-[12px] leading-[1.8] opacity-80 max-h-[280px] overflow-auto" aria-label="Files in the zip">
              {summarize(files).map((line) => (
                <li key={line} className="truncate whitespace-pre">
                  {line}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 flex flex-col gap-3">
            <div className="flex justify-between text-[14px]">
              <span className="text-ink-2">Icons</span>
              <span>{icons.length}</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-ink-2">AI cost for this set</span>
              <span className="font-mono tabular-nums">{formatUsd(project.spent)}</span>
            </div>
            {icons.length ? (
              <div className="flex justify-between text-[14px]">
                <span className="text-ink-2">Per icon</span>
                <span className="font-mono tabular-nums">{formatUsd(project.spent / icons.length)}</span>
              </div>
            ) : null}
            {unapproved ? (
              <p className="text-[13px] text-warning flex gap-2">
                <Icon name="alert" size={15} className="shrink-0 mt-px" />
                {unapproved} icons aren’t approved yet. They’re included anyway.
              </p>
            ) : null}
            <Button variant="primary" size="lg" icon="download" busy={busy} disabled={!icons.length || files.length <= 2} onClick={run}>
              Download zip
            </Button>
            <Button variant="plain" size="sm" onClick={onReset}>
              Start a new project
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Collapse long runs of files in a folder into one line each. */
function summarize(files: string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '';
    groups.set(dir, [...(groups.get(dir) ?? []), f.slice(dir.length)]);
  }
  const out: string[] = [];
  for (const [dir, names] of groups) {
    if (!dir) names.forEach((n) => out.push(n));
    else out.push(names.length > 2 ? `${dir.padEnd(14)}${names[0]} … ${names.length}` : `${dir.padEnd(14)}${names.join(', ')}`);
  }
  return out;
}
