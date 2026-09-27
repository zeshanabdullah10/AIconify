import { useMemo, useState, type ReactNode } from 'react';
import { ActionBar, Stat } from '../components/ActionBar';
import { InPlace } from '../components/InPlace';
import { Icon, type IconName } from '../components/icons';
import { Button, Card, Chips, ColorChips, Row, Section, Segmented, SvgView, Switch, TextField, cx, inputCls } from '../components/ui';
import { isHex, normalizeHex } from '../lib/color';
import { applyTargets, BUTTON_SIZES, buildZip, buttonOptions, exportable, iconAt, planFiles, PNG_SCALES, PNG_SIZES, TARGETS } from '../lib/exporter';
import { indicatorFiles, INDICATOR_KINDS, SIGNAL_COLORS, type IndicatorKind } from '../lib/indicators';
import { BANNER_MAX, BUTTON_SKINS, BUTTON_STATE_LABELS, BUTTON_STATES, bannerText, buttonBox, buttonState, STATUS, statusVariant, viIcon } from '../lib/labview';
import { formatUsd } from '../lib/models';
import { snapSvg } from '../lib/paths';
import { fileName } from '../lib/svg';
import type { ExportOptions, ExportTarget } from '../lib/types';
import { errorText, useStore } from '../store';

const TARGET_ICON: Record<ExportTarget, IconName> = { labview: 'panel', hmi: 'toolbox', web: 'grid', design: 'palette' };
const TARGET_WIRE: Record<ExportTarget, string> = {
  labview: 'var(--color-wire-bool)',
  hmi: 'var(--color-wire-num)',
  web: 'var(--color-wire-int)',
  design: 'var(--color-wire-str)',
};

export function ExportStep({ onBack }: { onBack: () => void }) {
  const { project, update, codec, notify } = useStore();
  const o = project.exportOptions;
  const [busy, setBusy] = useState(false);
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
  const hasFiles = files.some((f) => f !== 'brand.json' && !f.endsWith('README.md'));

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

  if (!icons.length) {
    return (
      <Card className="p-10 flex flex-col items-center text-center gap-3 grid-paper">
        <span className="w-12 h-12 rounded-[10px] bg-card border border-line flex items-center justify-center text-ink-2">
          <Icon name="download" size={22} />
        </span>
        <h1 className="text-[18px] font-semibold">Nothing to export yet</h1>
        <p className="text-ink-2 max-w-[360px]">Draw the set first. Everything here is then made in your browser, at no extra cost.</p>
        <Button variant="primary" icon="arrowLeft" onClick={onBack}>
          Back to Draw
        </Button>
      </Card>
    );
  }

  const toggleTarget = (id: ExportTarget, on: boolean) =>
    update((p) => ({ ...p, exportOptions: applyTargets(p.exportOptions, on ? p.exportOptions.targets.filter((x) => x !== id) : [...p.exportOptions.targets, id]) }));

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Export</h1>
        <p className="text-[14px] text-ink-2 mt-0.5">Say where the icons are going. The files are drawn in your browser by the same code as the previews.</p>
      </div>

      <div className="grid lg:grid-cols-[400px_minmax(0,1fr)] gap-4 items-start">
        <Card as="aside" aria-label="Export settings" className="overflow-hidden">
          <div className="p-4 border-b border-line">
            <h2 className="label-caps mb-2">Export for</h2>
            <div role="group" aria-label="Targets" className="flex flex-col gap-1.5">
              {TARGETS.map((t) => {
                const on = o.targets.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTarget(t.id, on)}
                    className={cx(
                      'text-left px-3 py-2.5 rounded-[8px] flex items-center gap-3 cursor-pointer transition-all',
                      on ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                    )}
                  >
                    <span className="relative w-8 h-8 rounded-[7px] bg-card flex items-center justify-center shrink-0 shadow-[inset_0_0_0_1px_var(--color-line)]">
                      <Icon name={TARGET_ICON[t.id]} size={17} />
                      <span aria-hidden="true" className="absolute -bottom-px left-1.5 right-1.5 h-[3px] rounded-full" style={{ background: TARGET_WIRE[t.id] }} />
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[14px] font-semibold">{t.label}</span>
                      <span className="text-[12px] text-ink-2 leading-snug">{t.hint}</span>
                    </span>
                    <span className={cx('w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0', on ? 'bg-accent text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]')}>
                      {on ? <Icon name="check" size={12} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remount when targets change, so sections for newly picked targets open. */}
          <div key={o.targets.join()} className="px-4">
            <Section title="Buttons" summary={o.buttons ? `${BUTTON_SKINS.find((k) => k.id === o.buttonSkin)?.label} · ${o.buttonShape} · ${o.buttonSize} px` : 'Off'} defaultOpen={o.buttons}>
              <Switch label="Button states" detail="False, True and both pressed pictures for a custom Boolean" checked={o.buttons} onChange={(v) => set({ buttons: v })} />
              {o.buttons ? (
                <div className="flex flex-col gap-2 pt-1">
                  <div role="radiogroup" aria-label="Button style" className="grid grid-cols-4 gap-1.5">
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
                            'py-2 px-1 rounded-[8px] flex flex-col items-center gap-1 cursor-pointer text-[11px] font-medium transition-all',
                            on ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                          )}
                        >
                          {sample?.svg ? (
                            <span className="flex gap-0.5">
                              {(['false', 'true'] as const).map((st) => (
                                <span key={st} className="w-7 h-7">
                                  <SvgView svg={buttonState(glyphOf(sample.svg!), st, { ...bOpts, skin: k.id, shape: 'square' })} />
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12px] text-ink-3">{BUTTON_SKINS.find((k) => k.id === o.buttonSkin)?.hint}. Only the part that moves or lights up changes colour.</p>
                  <Row label="Shape">
                    <Segmented size="sm" full label="Button shape" value={o.buttonShape} onChange={(buttonShape) => set({ buttonShape })} options={[{ value: 'square', label: 'Square' }, { value: 'wide', label: 'Wide, for Boolean text' }]} />
                  </Row>
                  <Row label="Size">
                    <Segmented size="sm" full label="Button size" value={o.buttonSize} onChange={(buttonSize) => set({ buttonSize })} options={BUTTON_SIZES.map((s) => ({ value: s, label: `${s} px` }))} />
                  </Row>
                  <Row label="True color">
                    <ColorChips label="State color" colors={stateColors} value={o.stateColor} onChange={(stateColor) => set({ stateColor })} />
                  </Row>
                  {sample?.svg ? (
                    <ul aria-label="Button state preview" className={cx('panel-face rounded-[8px] p-3 grid gap-2', o.buttonShape === 'wide' ? 'grid-cols-2' : 'grid-cols-4')}>
                      {BUTTON_STATES.map((st) => (
                        <li key={st} className="flex flex-col items-center gap-1 text-[10px] text-[#55585e] text-center">
                          <span style={{ width: bw * 0.9, height: bh * 0.9 }}>
                            <SvgView svg={buttonState(glyphOf(sample.svg!), st, bOpts)} label={`${sample.name}, ${BUTTON_STATE_LABELS[st]}`} />
                          </span>
                          {BUTTON_STATE_LABELS[st]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </Section>

            <Section title="VI icons" summary={o.viIcons ? (o.bannerText ? `Banner “${bannerText(o.bannerText)}”` : 'On, no banner') : 'Off'} defaultOpen={o.viIcons}>
              <Switch label="VI icons" detail="32×32 icons snapped to the pixel grid, plus glyphs for the Icon Editor" checked={o.viIcons} onChange={(v) => set({ viIcons: v })} />
              {o.viIcons ? (
                <div className="grid grid-cols-[1fr_auto] gap-3 pt-1 items-end">
                  <div className="flex flex-col gap-2">
                    <TextField label={`Banner text (up to ${BANNER_MAX} letters)`} value={o.bannerText} onChange={(v) => set({ bannerText: v.slice(0, BANNER_MAX * 2) })} placeholder="e.g. DAQ" mono />
                    <ColorChips label="Banner color" colors={[{ role: 'None', hex: '' }, ...palette, { role: 'Boolean green', hex: '#2f9e44' }, { role: 'Numeric orange', hex: '#e8590c' }]} value={o.bannerColor} onChange={(bannerColor) => set({ bannerColor })} />
                  </div>
                  {sample?.svg ? (
                    <div className="flex items-end gap-2 p-2 rounded-[8px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)]" aria-label="VI icon preview">
                      <span className="w-16 h-16">
                        <SvgView svg={viIcon(sample.svg, { banner: o.bannerText, bannerColor: o.bannerColor || undefined, pixel: project.style.style === 'pixel' })} label={`${sample.name} VI icon`} />
                      </span>
                      <span className="w-8 h-8">
                        <SvgView svg={viIcon(sample.svg, { banner: o.bannerText, bannerColor: o.bannerColor || undefined, pixel: project.style.style === 'pixel' })} />
                      </span>
                    </div>
                  ) : null}
                  {o.bannerText && bannerText(o.bannerText) !== o.bannerText.toUpperCase().trim() ? (
                    <p className="text-[12px] text-ink-3 col-span-2">Shown as “{bannerText(o.bannerText)}”: the banner fits {BANNER_MAX} letters, digits, dots or dashes.</p>
                  ) : null}
                </div>
              ) : null}
            </Section>

            <Section title="HMI states" summary={o.states ? '8 states per icon' : 'Off'} defaultOpen={o.states}>
              <Switch label="Status variants" detail="On, off, warning, alarm, manual, disabled and offline versions of every icon, ISA-101 style" checked={o.states} onChange={(v) => set({ states: v })} />
              {o.states && stateSample?.svg ? (
                <div className="flex flex-col gap-2 pt-1">
                  <ul aria-label="Status preview" className="grid grid-cols-4 gap-1.5">
                    {STATUS.map((s) => (
                      <li key={s.id} className="flex flex-col items-center gap-1 text-[10px] text-ink-2">
                        <span className="w-11 h-11 p-1.5 rounded-[8px] bg-[#dcdcdc]">
                          <SvgView svg={statusVariant(glyphOf(stateSample.svg!), s.id, { onColor: o.stateColor || undefined })} label={`${stateSample.name}, ${s.label}`} />
                        </span>
                        {s.label}
                      </li>
                    ))}
                  </ul>
                  <Row label="On color">
                    <ColorChips label="On color" colors={stateColors} value={o.stateColor} onChange={(stateColor) => set({ stateColor })} />
                  </Row>
                </div>
              ) : null}
            </Section>

            <Section title="Indicators" summary={o.indicators ? `${o.indicatorKinds.length} kinds · ${o.indicatorColors.length} colors` : 'Off'} defaultOpen={o.indicators}>
              <Switch label="Indicators" detail="LEDs and lamps as on/off pairs, tanks as level frames for a Picture Ring" checked={o.indicators} onChange={(v) => set({ indicators: v })} />
              {o.indicators ? <IndicatorOptions o={o} set={set} palette={palette} /> : null}
            </Section>

            <Section title="Files & formats" summary={[o.svg && 'SVG', o.png && 'PNG', o.emf && 'EMF', o.react && 'React', o.sprite && 'Sprite', o.figma && 'Figma'].filter(Boolean).join(' · ') || 'None'}>
              <div className="flex flex-col">
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
              <Field label="Densities" detail="LabVIEW doesn’t rescale images, so add @1.5x and @2x for high-DPI screens.">
                <Chips label="PNG densities" options={PNG_SCALES.map((s) => ({ value: s, label: `${s}×`, disabled: s === 1 }))} value={[1, ...o.pngScales.filter((s) => s !== 1)]} onChange={(pngScales) => set({ pngScales })} mono />
              </Field>
              <div className="pt-2">
                <Switch label="Pixel-snap small PNGs" detail="Edges on whole pixels at 64 px and below, so small icons stay crisp" checked={o.pixelSnap} onChange={(v) => set({ pixelSnap: v })} />
                {sample?.svg ? <SnapPreview svg={sample.svg} on={o.pixelSnap} /> : null}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="naming" className="text-[12px] font-medium text-ink-2">
                    File names
                  </label>
                  <select id="naming" value={o.naming} onChange={(e) => set({ naming: e.target.value as ExportOptions['naming'] })} className={cx(inputCls, 'h-9 cursor-pointer')}>
                    <option value="kebab">coffee-cup</option>
                    <option value="pascal">CoffeeCup</option>
                    <option value="snake">coffee_cup</option>
                  </select>
                </div>
                <TextField label="Prefix" value={o.prefix} onChange={(v) => set({ prefix: v.replace(/[^A-Za-z0-9_-]/g, '') })} placeholder="e.g. fl-" mono />
              </div>
            </Section>
          </div>
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          <Card className="overflow-hidden" aria-label="See it in place">
            {/* Remount when targets change, so the preview opens on the most relevant view. */}
            <InPlace key={o.targets.join()} project={project} o={o} />
          </Card>
          <Card className="p-4 bg-[#15181d]! border-transparent text-[#e8eaed]" aria-label="Zip contents">
            <div className="flex items-center mb-2">
              <span className="flex-1 text-[13px] font-semibold truncate font-mono">{zipName}</span>
              <span className="text-[12px] font-mono text-[#8a929c]">{files.length} files</span>
            </div>
            <ul className="font-mono text-[12px] leading-[1.75] text-[#b8bec6] max-h-[240px] overflow-auto" aria-label="Files in the zip">
              {summarize(files).map((line) => (
                <li key={line} className="truncate whitespace-pre">
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ActionBar
        summary={
          <>
            <Stat value={icons.length} label="icons" />
            <Stat value={files.length} label="files" />
            <Stat value={formatUsd(project.spent)} label="AI cost" />
            {unapproved ? (
              <span className="text-warning inline-flex items-center gap-1">
                <Icon name="alert" size={14} />
                {unapproved} not approved, included anyway
              </span>
            ) : null}
          </>
        }
      >
        <Button variant="primary" size="lg" icon="download" busy={busy} disabled={!hasFiles} onClick={run}>
          Download zip
        </Button>
      </ActionBar>
    </>
  );
}

function IndicatorOptions({ o, set, palette }: { o: ExportOptions; set: (p: Partial<ExportOptions>) => void; palette: { role: string; hex: string }[] }) {
  const [custom, setCustom] = useState('');
  const choices = [...SIGNAL_COLORS, ...palette.filter((c) => !SIGNAL_COLORS.some((s) => s.hex === c.hex))];
  const extra = o.indicatorColors.filter((c) => !choices.some((x) => x.hex === c)).map((hex) => ({ role: hex, hex }));
  const kinds = o.indicatorKinds.filter((k): k is IndicatorKind => INDICATOR_KINDS.some((x) => x.id === k));
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <Chips label="Indicator kinds" options={INDICATOR_KINDS.map((k) => ({ value: k.id, label: k.label }))} value={o.indicatorKinds} onChange={(indicatorKinds) => set({ indicatorKinds })} />
      <div role="group" aria-label="Indicator colors" className="flex flex-wrap items-center gap-1.5">
        {[...choices, ...extra].map((c) => {
          const on = o.indicatorColors.includes(c.hex);
          return (
            <button
              key={c.hex}
              type="button"
              aria-pressed={on}
              onClick={() => set({ indicatorColors: on ? o.indicatorColors.filter((x) => x !== c.hex) : [...o.indicatorColors, c.hex] })}
              className={cx('h-7 pl-1 pr-2.5 rounded-[6px] inline-flex items-center gap-1.5 text-[12px] cursor-pointer transition-colors', on ? 'bg-ink text-canvas' : 'bg-card shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-raised')}
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
          className={cx(inputCls, 'h-7 w-20 text-[12px] font-mono')}
        />
      </div>
      <Row label="Size">
        <Segmented size="sm" full label="Indicator size" value={o.indicatorSize} onChange={(indicatorSize) => set({ indicatorSize })} options={[16, 24, 32, 48].map((s) => ({ value: s, label: `${s} px` }))} />
      </Row>
      {kinds.length && o.indicatorColors.length ? (
        <ul aria-label="Indicator preview" className="panel-face rounded-[8px] p-2 flex flex-wrap gap-1.5">
          {kinds.flatMap((k) =>
            o.indicatorColors.slice(0, 3).flatMap((c) =>
              indicatorFiles(k, c).map((f) => (
                <li key={f.name} title={f.name} className="w-8 h-8">
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

/** Side by side: the icon at 16 and 24 px, as traced or snapped to the pixel grid. */
function SnapPreview({ svg, on }: { svg: string; on: boolean }) {
  return (
    <div className="flex items-center gap-4 pb-1 text-[12px] text-ink-2" aria-label="Pixel-snap preview">
      {[16, 24].map((px) => (
        <span key={px} className="flex items-center gap-2">
          <span className="rounded-[6px] bg-paper p-1 shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ width: px + 8, height: px + 8 }}>
            <SvgView svg={on ? snapSvg(svg, px) : svg} />
          </span>
          <span className="font-mono">{px}px</span>
        </span>
      ))}
    </div>
  );
}

function Field({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="pt-3">
      <h3 className="text-[12px] font-medium text-ink-2 mb-1">{label}</h3>
      {detail ? <p className="text-[12px] text-ink-3 mb-1.5">{detail}</p> : null}
      {children}
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
    else out.push(names.length > 2 ? `${dir.padEnd(24)}${names[0]} … ${names.length}` : `${dir.padEnd(24)}${names.join(', ')}`);
  }
  return out;
}
