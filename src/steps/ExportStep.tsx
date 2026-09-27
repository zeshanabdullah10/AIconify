import { useMemo, useState, type ReactNode } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Button, Card, CardHeader, Segmented, SvgView, Switch, TextField, cx } from '../components/ui';
import { isHex, normalizeHex } from '../lib/color';
import { applyTargets, BUTTON_SIZES, buildZip, buttonOptions, exportable, iconAt, planFiles, PNG_SCALES, PNG_SIZES, TARGETS } from '../lib/exporter';
import { indicatorFiles, INDICATOR_KINDS, SIGNAL_COLORS, type IndicatorKind } from '../lib/indicators';
import { BANNER_MAX, BUTTON_SKINS, BUTTON_STATE_LABELS, BUTTON_STATES, bannerText, buttonBox, buttonState, STATUS, statusVariant, viIcon } from '../lib/labview';
import { formatUsd } from '../lib/models';
import { snapSvg } from '../lib/paths';
import { fileName } from '../lib/svg';
import { InPlace } from '../components/InPlace';
import type { ExportOptions } from '../lib/types';
import { errorText, useStore } from '../store';

export function ExportStep({ onReset }: { onReset: () => void }) {
  const { project, update, codec, notify } = useStore();
  const o = project.exportOptions;
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const set = (patch: Partial<ExportOptions>) => update((p) => ({ ...p, exportOptions: { ...p.exportOptions, ...patch } }));
  const icons = exportable(project.icons);
  const unapproved = icons.filter((i) => i.status !== 'approved').length;
  const files = useMemo(() => planFiles(project, o), [project, o]);
  const zipName = `${fileName(project.brand.name || 'icons', 'kebab')}-icons.zip`;
  const sample = icons.find((i) => i.status === 'approved') ?? icons[0];
  // States read best on an icon with a moving or glowing part.
  const stateSample = icons.find((i) => i.svg?.includes('class="active"')) ?? sample;
  const palette = project.brand.palette.filter((c) => isHex(c.hex));
  const bOpts = buttonOptions(project, o);
  const [bw, bh] = buttonBox(o.buttonShape);
  const stateColors = [{ role: 'Default', hex: '' }, ...SIGNAL_COLORS, ...palette.filter((c) => !SIGNAL_COLORS.some((x) => x.hex === c.hex))];
  const glyphOf = (svg: string) => iconAt(project, o, svg);

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
      <StepHeader eyebrow="Step 5 of 5" title="Take it everywhere." subtitle="Say where the icons are going and the zip is set up for it: code, design tools, LabVIEW or an HMI." />
      <div className="grid lg:grid-cols-[1fr_400px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <Card className="p-5 sm:p-6 flex flex-col gap-4" aria-label="Where will you use these?">
            <CardHeader title="Where will you use these?" detail="Pick one or more. Every file can still be fine-tuned under Customize files." />
            <div role="group" aria-label="Targets" className="grid sm:grid-cols-2 gap-3">
              {TARGETS.map((t) => {
                const on = o.targets.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update((p) => ({ ...p, exportOptions: applyTargets(p.exportOptions, on ? p.exportOptions.targets.filter((x) => x !== t.id) : [...p.exportOptions.targets, t.id]) }))}
                    className={cx(
                      'text-left p-4 rounded-[16px] flex items-start gap-3 cursor-pointer transition-all',
                      on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                    )}
                  >
                    <span className={cx('mt-0.5 w-5 h-5 rounded-[6px] flex items-center justify-center shrink-0', on ? 'bg-accent text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]')}>
                      {on ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[15px] font-semibold">{t.label}</span>
                      <span className="text-[13px] text-ink-2">{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {icons.length ? (
            <Card className="p-5 sm:p-6 flex flex-col gap-4" aria-label="See it in place">
              <CardHeader title="See it in place" detail="Drawn by the same code that writes the zip." />
              {/* Remount when targets change, so the preview opens on the most relevant view. */}
              <InPlace key={o.targets.join()} project={project} o={o} />
            </Card>
          ) : null}

          <button
            type="button"
            aria-expanded={custom}
            onClick={() => setCustom((v) => !v)}
            className="self-start inline-flex items-center gap-2 h-10 px-4 rounded-full bg-fill hover:bg-fill-2 text-[14px] font-medium cursor-pointer"
          >
            Customize files
            <Icon name="chevronDown" size={16} className={cx('transition-transform', custom && 'rotate-180')} />
          </button>

          {custom ? (
          <>
          <Card className="p-5 sm:p-6 flex flex-col gap-2">
            <CardHeader title="Formats" />
            <div className="divide-y divide-line -mt-2">
              <Switch label="SVG" detail="Clean vector files, 24×24 viewBox" checked={o.svg} onChange={(v) => set({ svg: v })} />
              <Switch label="PNG" detail="Transparent, at the sizes below" checked={o.png} onChange={(v) => set({ png: v })} />
              <Switch label="EMF" detail="Windows vector files. LabVIEW scales them without blurring" checked={o.emf} onChange={(v) => set({ emf: v })} />
              <Switch label="React components" detail="Typed .tsx with size and title props" checked={o.react} onChange={(v) => set({ react: v })} />
              <Switch label="SVG sprite" detail="One file for <use href>" checked={o.sprite} onChange={(v) => set({ sprite: v })} />
              <Switch label="Figma" detail="One SVG with a named layer per icon" checked={o.figma} onChange={(v) => set({ figma: v })} />
            </div>
            {o.png ? (
              <Field label="PNG sizes">
                <Chips label="PNG sizes" options={PNG_SIZES.map((s) => ({ value: s, label: String(s) }))} value={o.pngSizes} onChange={(pngSizes) => set({ pngSizes })} mono />
              </Field>
            ) : null}
            <Field label="Densities" detail="LabVIEW doesn’t rescale images, so add @1.5x and @2x for high-DPI screens. Applies to every PNG.">
              <Chips
                label="PNG densities"
                options={PNG_SCALES.map((s) => ({ value: s, label: `${s}×`, disabled: s === 1 }))}
                value={[1, ...o.pngScales.filter((s) => s !== 1)]}
                onChange={(pngScales) => set({ pngScales })}
                mono
              />
            </Field>
            <div className="pt-2">
              <Switch
                label="Pixel-snap small PNGs"
                detail="Moves edges onto whole pixels at 64 px and below, so small icons stay crisp"
                checked={o.pixelSnap}
                onChange={(v) => set({ pixelSnap: v })}
              />
              {sample?.svg ? <SnapPreview svg={sample.svg} on={o.pixelSnap} /> : null}
            </div>
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

          <Card className="p-5 sm:p-6 flex flex-col gap-2" aria-label="LabVIEW">
            <CardHeader title="LabVIEW" detail="Front-panel buttons and VI icons, with an import guide in the zip." />
            <div className="divide-y divide-line -mt-2">
              <div className="pb-3">
                <Switch label="Button states" detail="False, True and both pressed pictures for a custom boolean" checked={o.buttons} onChange={(v) => set({ buttons: v })} />
                {o.buttons ? (
                  <div className="flex flex-col gap-3 pt-2">
                    <div role="radiogroup" aria-label="Button style" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BUTTON_SKINS.map((k) => {
                        const on = o.buttonSkin === k.id;
                        return (
                          <button
                            key={k.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            title={k.hint}
                            onClick={() => set({ buttonSkin: k.id })}
                            className={cx(
                              'p-3 rounded-[14px] flex flex-col items-center gap-2 cursor-pointer text-[13px] transition-all',
                              on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                            )}
                          >
                            {sample?.svg ? (
                              <span className="flex gap-1.5">
                                {(['false', 'true'] as const).map((st) => (
                                  <span key={st} className="w-9 h-9">
                                    <SvgView svg={buttonState(glyphOf(sample.svg!), st, { ...bOpts, skin: k.id, shape: 'square' })} />
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <span className="font-medium">{k.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-ink-3 -mt-1">{BUTTON_SKINS.find((k) => k.id === o.buttonSkin)?.hint}. Only the part of the icon that moves or lights up changes colour.</p>
                    <Row label="Shape">
                      <Segmented size="sm" label="Button shape" value={o.buttonShape} onChange={(buttonShape) => set({ buttonShape })} options={[{ value: 'square', label: 'Square' }, { value: 'wide', label: 'Wide, for Boolean text' }]} />
                    </Row>
                    <Row label="Size">
                      <Segmented size="sm" label="Button size" value={o.buttonSize} onChange={(buttonSize) => set({ buttonSize })} options={BUTTON_SIZES.map((s) => ({ value: s, label: `${s} px` }))} />
                    </Row>
                    <Row label="True">
                      <ColorChips label="State color" colors={stateColors} value={o.stateColor} onChange={(stateColor) => set({ stateColor })} />
                    </Row>
                    {sample?.svg ? (
                      <ul aria-label="Button state preview" className={cx('grid gap-2', o.buttonShape === 'wide' ? 'grid-cols-2 max-w-[360px]' : 'grid-cols-4 max-w-[360px]')}>
                        {BUTTON_STATES.map((st) => (
                          <li key={st} className="flex flex-col items-center gap-1.5 text-[11px] text-ink-2 text-center">
                            <span style={{ width: bw, height: bh }}>
                              <SvgView svg={buttonState(glyphOf(sample.svg!), st, bOpts)} label={`${sample.name}, ${BUTTON_STATE_LABELS[st]}`} />
                            </span>
                            {BUTTON_STATE_LABELS[st]}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="py-3">
                <Switch label="VI icons" detail="32×32 icons snapped to the pixel grid, plus glyphs for the Icon Editor" checked={o.viIcons} onChange={(v) => set({ viIcons: v })} />
                {o.viIcons ? (
                  <div className="grid sm:grid-cols-[1fr_auto] gap-4 pt-2 items-end">
                    <div className="flex flex-col gap-3">
                      <TextField
                        label={`Banner text (up to ${BANNER_MAX} letters)`}
                        value={o.bannerText}
                        onChange={(v) => set({ bannerText: v.slice(0, BANNER_MAX * 2) })}
                        placeholder="e.g. DAQ"
                      />
                      <Row label="Banner">
                        <ColorChips
                          label="Banner color"
                          colors={[{ role: 'None', hex: '' }, ...palette]}
                          value={o.bannerColor}
                          onChange={(bannerColor) => set({ bannerColor })}
                        />
                      </Row>
                    </div>
                    {sample?.svg ? (
                      <div className="flex items-end gap-3" aria-label="VI icon preview">
                        <span className="w-16 h-16">
                          <SvgView svg={viIcon(sample.svg, { banner: o.bannerText, bannerColor: o.bannerColor || undefined })} label={`${sample.name} VI icon`} />
                        </span>
                        <span className="w-8 h-8">
                          <SvgView svg={viIcon(sample.svg, { banner: o.bannerText, bannerColor: o.bannerColor || undefined })} />
                        </span>
                      </div>
                    ) : null}
                    {o.bannerText && bannerText(o.bannerText) !== o.bannerText.toUpperCase().trim() ? (
                      <p className="text-[12px] text-ink-3 sm:col-span-2">
                        Shown as “{bannerText(o.bannerText)}”: the banner fits {BANNER_MAX} letters, digits, dots or dashes.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6 flex flex-col gap-2" aria-label="Industrial">
            <CardHeader title="Industrial" detail="HMI status variants and indicator lamps. Drawn locally, so they cost nothing." />
            <div className="divide-y divide-line -mt-2">
              <div className="pb-3">
                <Switch
                  label="Status variants"
                  detail="On, off, warning, alarm, manual, disabled and offline versions of every icon, ISA-101 style"
                  checked={o.states}
                  onChange={(v) => set({ states: v })}
                />
                {o.states && sample?.svg ? (
                  <div className="flex flex-col gap-3 pt-2">
                    <ul aria-label="Status preview" className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {STATUS.map((s) => (
                        <li key={s.id} className="flex flex-col items-center gap-1.5 text-[11px] text-ink-2">
                          <span className="w-12 h-12 p-1.5 rounded-[10px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)]">
                            <SvgView svg={statusVariant(glyphOf(stateSample!.svg!), s.id, { onColor: o.stateColor || undefined })} label={`${stateSample!.name}, ${s.label}`} />
                          </span>
                          {s.label}
                        </li>
                      ))}
                    </ul>
                    <Row label="On">
                      <ColorChips label="On color" colors={stateColors} value={o.stateColor} onChange={(stateColor) => set({ stateColor })} />
                    </Row>
                  </div>
                ) : null}
              </div>
              <div className="pt-3">
                <Switch label="Indicators" detail="LEDs and lamps as on/off pairs, tanks as level frames for a Picture Ring" checked={o.indicators} onChange={(v) => set({ indicators: v })} />
                {o.indicators ? <IndicatorOptions o={o} set={set} palette={palette} /> : null}
              </div>
            </div>
          </Card>
          </>
          ) : null}
        </div>

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
            <Button variant="primary" size="lg" icon="download" busy={busy} disabled={!files.some((f) => f !== 'brand.json' && !f.endsWith('README.md'))} onClick={run}>
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

function IndicatorOptions({ o, set, palette }: { o: ExportOptions; set: (p: Partial<ExportOptions>) => void; palette: { role: string; hex: string }[] }) {
  const [custom, setCustom] = useState('');
  const choices = [...SIGNAL_COLORS, ...palette.filter((c) => !SIGNAL_COLORS.some((s) => s.hex === c.hex))];
  const extra = o.indicatorColors.filter((c) => !choices.some((x) => x.hex === c)).map((hex) => ({ role: hex, hex }));
  const kinds = o.indicatorKinds.filter((k): k is IndicatorKind => INDICATOR_KINDS.some((x) => x.id === k));
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Chips label="Indicator kinds" options={INDICATOR_KINDS.map((k) => ({ value: k.id, label: k.label }))} value={o.indicatorKinds} onChange={(indicatorKinds) => set({ indicatorKinds })} />
      <div role="group" aria-label="Indicator colors" className="flex flex-wrap items-center gap-2">
        {[...choices, ...extra].map((c) => {
          const on = o.indicatorColors.includes(c.hex);
          return (
            <button
              key={c.hex}
              type="button"
              aria-pressed={on}
              onClick={() => set({ indicatorColors: on ? o.indicatorColors.filter((x) => x !== c.hex) : [...o.indicatorColors, c.hex] })}
              className={cx('h-8 pl-1.5 pr-3 rounded-full inline-flex items-center gap-2 text-[13px] cursor-pointer transition-colors', on ? 'bg-ink text-canvas' : 'bg-fill hover:bg-fill-2')}
            >
              <span className="w-5 h-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: c.hex }} />
              {c.role}
            </button>
          );
        })}
        <input
          aria-label="Add indicator color (hex)"
          value={custom}
          placeholder="#hex"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !isHex(custom)) return;
            const hex = normalizeHex(custom);
            if (!o.indicatorColors.includes(hex)) set({ indicatorColors: [...o.indicatorColors, hex] });
            setCustom('');
          }}
          className="h-8 w-24 px-3 rounded-full bg-fill text-[13px] font-mono outline-none border border-transparent focus:border-accent"
        />
      </div>
      <Row label="Size">
        <Segmented size="sm" label="Indicator size" value={o.indicatorSize} onChange={(indicatorSize) => set({ indicatorSize })} options={[16, 24, 32, 48].map((s) => ({ value: s, label: `${s} px` }))} />
      </Row>
      {kinds.length && o.indicatorColors.length ? (
        <ul aria-label="Indicator preview" className="flex flex-wrap gap-2">
          {kinds.flatMap((k) =>
            o.indicatorColors.slice(0, 3).flatMap((c) =>
              indicatorFiles(k, c).map((f) => (
                <li key={f.name} title={f.name} className="w-10 h-10 p-1 rounded-[8px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <SvgView svg={f.svg} label={f.name} />
                </li>
              )),
            ),
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Side by side: the icon at 16 px as traced, and snapped to the pixel grid. */
function SnapPreview({ svg, on }: { svg: string; on: boolean }) {
  return (
    <div className="flex items-center gap-4 pb-2 text-[12px] text-ink-2" aria-label="Pixel-snap preview">
      {[16, 24].map((px) => (
        <span key={px} className="flex items-center gap-2">
          <span className="rounded-[6px] bg-paper p-1 shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ width: px + 8, height: px + 8 }}>
            <SvgView svg={on ? snapSvg(svg, px) : svg} />
          </span>
          {px} px
        </span>
      ))}
    </div>
  );
}

function Field({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="pt-4">
      <h3 className="text-[13px] font-medium text-ink-2 mb-1">{label}</h3>
      {detail ? <p className="text-[12px] text-ink-3 mb-2">{detail}</p> : <div className="mb-1" />}
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="w-16 text-[13px] text-ink-2">{label}</span>
      {children}
    </div>
  );
}

/** Multi-select pill buttons. */
function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  mono,
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T[];
  onChange: (v: T[]) => void;
  mono?: boolean;
}) {
  const order = options.map((x) => x.value);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = value.includes(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={on}
            disabled={opt.disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== opt.value) : [...value, opt.value].sort((a, b) => order.indexOf(a) - order.indexOf(b)))}
            className={cx(
              'h-9 min-w-14 px-3 rounded-full text-[13px] cursor-pointer transition-colors disabled:cursor-default',
              mono && 'font-mono tabular-nums',
              on ? 'bg-ink text-canvas' : 'bg-fill text-ink hover:bg-fill-2',
              opt.disabled && 'opacity-70',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ColorChips({ label, colors, value, onChange }: { label: string; colors: { role: string; hex: string }[]; value: string; onChange: (hex: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c.hex || 'none'}
          type="button"
          role="radio"
          aria-checked={value === c.hex}
          aria-label={c.hex ? `${c.role} ${c.hex}` : c.role}
          onClick={() => onChange(c.hex)}
          className={cx('w-8 h-8 rounded-full p-[3px] cursor-pointer', value === c.hex ? 'shadow-[0_0_0_2px_var(--color-accent)]' : 'hover:shadow-[0_0_0_2px_var(--color-line-strong)]')}
        >
          <span
            className="block w-full h-full rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
            style={{ background: c.hex || 'repeating-linear-gradient(135deg, var(--color-fill) 0 4px, var(--color-card) 4px 8px)' }}
          />
        </button>
      ))}
    </div>
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
