import { useEffect, useRef, useState } from 'react';
import { ActionBar, Stat } from '../components/ActionBar';
import { BrandKit, brandSummary } from '../components/BrandKit';
import { Icon } from '../components/icons';
import { Button, Card, CardHeader, ColorChips, DropZone, Row, Section, Segmented, Spinner, SvgView, Switch, cx } from '../components/ui';
import { readFileAsDataUrl } from '../lib/codec';
import { luminance } from '../lib/color';
import { buttonState, statusVariant, type StatusId } from '../lib/labview';
import { estimateSheets, formatUsd, getModel } from '../lib/models';
import { extractPalette } from '../lib/palette';
import { LINE_STYLES, MAX_PER_SHEET, suggestIcons, uid } from '../lib/pipeline';
import { ICON_PACKS, PACK_GROUPS } from '../lib/presets';
import { STYLE_LABELS, styleLock } from '../lib/prompts';
import { ensureTransparent, fitSquare } from '../lib/raster';
import { SAMPLES, sampleSvg, type Sample } from '../lib/samples';
import type { IconStyle, ReferenceIcon, StyleLock } from '../lib/types';
import { errorText, useStore } from '../store';

const HMI_GREY = '#4d4d4d';
const MAX_REFERENCES = 8;

export function SetupStep({ onNext }: { onNext: () => void }) {
  const { project } = useStore();
  const names = project.iconNames;
  const sheets = Math.ceil(names.length / MAX_PER_SHEET);
  const estimate = estimateSheets(project.modelId, project.quality, sheets, project.candidates);
  const s = project.style;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Set up the icon set</h1>
        <p className="text-[14px] text-ink-2 mt-0.5">Choose the icons you need and one look for all of them. The preview shows them as LabVIEW buttons.</p>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <IconsPanel />
          <Card className="px-4 sm:px-5 py-1">
            <Section title="Match an existing icon set" summary={project.references.length ? `${project.references.length} icons` : 'Optional'} defaultOpen={project.references.length > 0}>
              <References />
            </Section>
            <Section title="Brand kit" summary={brandSummary(project.brand)} defaultOpen={project.brand.analyzed}>
              <BrandKit />
            </Section>
            <Section title="Prompt" summary="Sent with every sheet">
              <p className="text-[12px] leading-relaxed font-mono text-ink-2 bg-raised rounded-[8px] p-3">{styleLock(s, project.brand)}</p>
            </Section>
          </Card>
        </div>
        <LookPanel />
      </div>
      <ActionBar
        summary={
          <>
            <Stat value={names.length} label={names.length === 1 ? 'icon' : 'icons'} />
            <Stat value={sheets} label={sheets === 1 ? 'sheet' : 'sheets'} />
            <Stat value={`~${formatUsd(estimate)}`} label="to draw" />
            <span className="hidden md:inline">
              {STYLE_LABELS[s.style].name}
              {s.hmi ? ' · ISA-101' : ''}
              {s.parts ? ' · state parts' : ''}
            </span>
          </>
        }
      >
        <Button variant="primary" size="lg" onClick={onNext} disabled={names.length === 0}>
          Continue to Draw
          <Icon name="arrowRight" size={17} />
        </Button>
      </ActionBar>
    </>
  );
}

/* ---------- icons ---------- */

function IconsPanel() {
  const { project, update, deps, notify } = useStore();
  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const names = project.iconNames;
  const lower = new Set(names.map((n) => n.toLowerCase()));
  const setNames = (fn: (n: string[]) => string[]) => update((p) => ({ ...p, iconNames: fn(p.iconNames) }));
  const add = (list: string[]) =>
    setNames((n) => {
      const have = new Set(n.map((x) => x.toLowerCase()));
      return [...n, ...list.map((x) => x.trim()).filter((x) => x && !have.has(x.toLowerCase()))].slice(0, 64);
    });

  const suggest = async () => {
    const d = deps();
    if (!d) return;
    setSuggesting(true);
    try {
      const more = await suggestIcons(d, project.brand, names, 8);
      add(more);
      notify(more.length ? `Added ${more.length} suggestions.` : 'No new suggestions this time.', 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Icons in this set"
        marker="var(--color-wire-num)"
        detail={names.length ? `${names.length} icons · ${Math.ceil(names.length / MAX_PER_SHEET)} sheet${names.length > MAX_PER_SHEET ? 's' : ''} of up to 16` : 'Start from a pack, type your own, or ask for suggestions.'}
        action={
          names.length ? (
            <Button size="sm" variant="ghost" onClick={() => setNames(() => [])}>
              Clear
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 mb-4">
        {PACK_GROUPS.map((g) => (
          <div key={g.label}>
            <h3 className="label-caps mb-1.5">{g.label}</h3>
            <ul className="grid grid-cols-2 xl:grid-cols-3 gap-2">
              {g.packs.map((pack) => {
                const list = ICON_PACKS[pack];
                const added = list.every((n) => lower.has(n.toLowerCase()));
                return (
                  <li key={pack}>
                    <button
                      type="button"
                      aria-label={`Add ${pack} pack`}
                      disabled={added}
                      onClick={() => add(list)}
                      className={cx(
                        'w-full h-full text-left p-2.5 rounded-[8px] flex flex-col gap-0.5 cursor-pointer transition-colors disabled:cursor-default',
                        added ? 'bg-success-soft' : 'bg-raised hover:bg-accent-soft shadow-[inset_0_0_0_1px_var(--color-line)]',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <span className="flex-1 truncate">{pack}</span>
                        {added ? <Icon name="check" size={14} strokeWidth={2.4} className="text-success" /> : <Icon name="plus" size={14} className="text-ink-3" />}
                      </span>
                      <span className="text-[11px] text-ink-3 truncate">{list.slice(0, 4).join(', ')}…</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-[10px] bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] p-2.5">
        {names.length ? (
          <ul aria-label="Icon names" className="flex flex-wrap gap-1.5 mb-2.5">
            {names.map((n) => (
              <li key={n} className="inline-flex items-center h-7 pl-2.5 pr-0.5 gap-0.5 rounded-[6px] bg-card text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--color-line)]">
                {n}
                <button type="button" aria-label={`Remove ${n}`} onClick={() => setNames((x) => x.filter((y) => y !== n))} className="w-6 h-6 rounded-[5px] text-ink-3 hover:text-ink hover:bg-fill flex items-center justify-center cursor-pointer">
                  <Icon name="x" size={11} strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3 px-1 pb-2.5">No icons yet. Pick a pack above or type names below.</p>
        )}
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Add an icon</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(draft.split(','));
                  setDraft('');
                }
              }}
              placeholder="Add icons, comma separated, then Enter"
              className="w-full h-9 px-3 rounded-[8px] bg-card text-[14px] outline-none shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1.5px_var(--color-accent)] placeholder:text-ink-3"
            />
          </label>
          <Button icon="sparkles" busy={suggesting} onClick={suggest}>
            Suggest
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------- look ---------- */

function LookPanel() {
  const { project, update } = useStore();
  const s = project.style;
  const setStyle = (patch: Partial<StyleLock>) => update((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const base = project.brand.palette.length ? project.brand.palette : [{ role: 'Ink', hex: '#1d1d1f' }, { role: 'Blue', hex: '#2257e6' }];
  const colors = [...base, ...(base.some((c) => c.hex === HMI_GREY) ? [] : [{ role: 'HMI grey', hex: HMI_GREY }])];
  const withCurrent = (hex: string, role: string) => (colors.some((c) => c.hex === hex) ? colors : [...colors, { role, hex }]);
  const lineStyle = LINE_STYLES.includes(s.style);
  const showAccent = s.colorMode === 'brand' && !s.hmi && (s.style === 'duotone' || s.style === 'badge' || s.style === 'pixel' || s.parts);

  return (
    <Card as="aside" aria-label="Look" className="lg:sticky lg:top-[72px] overflow-hidden">
      <LookPreview />
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        <div>
          <h3 className="label-caps mb-2">Style</h3>
          <div role="radiogroup" aria-label="Icon style" className="grid grid-cols-3 gap-2">
            {(Object.keys(STYLE_LABELS) as IconStyle[]).map((id) => {
              const on = s.style === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${STYLE_LABELS[id].name}, ${STYLE_LABELS[id].hint}`}
                  title={STYLE_LABELS[id].hint}
                  onClick={() => setStyle({ style: id })}
                  className={cx(
                    'p-2 rounded-[8px] flex flex-col items-center gap-1.5 cursor-pointer transition-all',
                    on ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                  )}
                >
                  <span className="flex gap-1 rounded-[6px] bg-paper p-1.5">
                    {SAMPLES.slice(0, 2).map((sm) => (
                      <SampleIcon key={sm.name} sample={sm} style={id} s={s} size={22} />
                    ))}
                  </span>
                  <span className="text-[12px] font-medium">{STYLE_LABELS[id].name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {lineStyle ? (
            <Row label="Weight">
              <Segmented
                size="sm"
                full
                label="Line weight"
                value={s.weight ?? 'regular'}
                onChange={(weight) => setStyle({ weight })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'regular', label: 'Regular' },
                  { value: 'bold', label: 'Bold' },
                ]}
              />
            </Row>
          ) : null}
          {s.style !== 'pixel' ? (
            <Row label="Stroke">
              <Segmented size="sm" full label="Stroke weight" value={s.strokeWeight} onChange={(v) => setStyle({ strokeWeight: v })} options={[1.5, 2, 2.5].map((v) => ({ value: v, label: `${v} px` }))} />
            </Row>
          ) : null}
          <Row label="Corners">
            <Segmented size="sm" full label="Corners" value={s.corners} onChange={(v) => setStyle({ corners: v })} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'sharp', label: 'Sharp' }]} />
          </Row>
        </div>

        <div className="flex flex-col gap-1 pt-3 border-t border-line">
          <Row label="Look">
            <Segmented
              size="sm"
              full
              label="Look"
              value={s.hmi ? 'hmi' : 'brand'}
              onChange={(v) => setStyle(v === 'hmi' ? { hmi: true, parts: true, colorMode: 'mono', primary: HMI_GREY } : { hmi: false })}
              options={[
                { value: 'brand', label: 'Your colors' },
                { value: 'hmi', label: 'Industrial HMI' },
              ]}
            />
          </Row>
          {s.hmi ? <p className="text-[12px] text-ink-2 pl-[100px] -mt-0.5 mb-1">ISA-101: muted grey symbols. Color is saved for alarms and states.</p> : null}
          {!s.hmi ? (
            <Row label="Colors">
              <Segmented size="sm" full label="Color mode" value={s.colorMode} onChange={(v) => setStyle({ colorMode: v })} options={[{ value: 'brand', label: 'Two colors' }, { value: 'mono', label: 'One color' }]} />
            </Row>
          ) : null}
          <Row label="Main color">
            <ColorPick label="Main color" value={s.primary} colors={withCurrent(s.primary, 'Custom')} onPick={(hex) => setStyle({ primary: hex })} />
          </Row>
          {showAccent ? (
            <Row label={s.parts ? 'Part color' : 'Accent'}>
              <ColorPick label="Accent color" value={s.accent} colors={withCurrent(s.accent, 'Custom accent')} onPick={(hex) => setStyle({ accent: hex })} />
            </Row>
          ) : null}
        </div>

        <div className="pt-2 border-t border-line">
          <Switch
            label="State parts"
            detail="Draw the part that moves or lights up (an impeller, a valve disc, a lamp) as its own layer, so True and On light up just that part."
            checked={!!s.parts}
            onChange={(parts) => setStyle({ parts })}
          />
        </div>
      </div>
    </Card>
  );
}

const PREVIEW_STATES: StatusId[] = ['normal', 'on', 'alarm', 'manual'];

/** The look before anything is drawn: sample icons as LabVIEW buttons, as icons, and in states. */
function LookPreview() {
  const { project } = useStore();
  const s = project.style;
  const o = project.exportOptions;
  const opts = { skin: o.buttonSkin, shape: 'square' as const, primary: s.primary, stateColor: o.stateColor || undefined };
  // Pixel art is previewed as line work on buttons; the tiles show the real pixels.
  const svgOf = (sm: Sample) => sampleSvg(sm, s.style === 'pixel' ? 'outline' : s.style, s.style === 'pixel' ? { ...s, corners: 'sharp' } : s);
  return (
    <div aria-label="Look preview" className="border-b border-line">
      <div className="panel-face px-4 pt-3 pb-4">
        <div className="text-[11px] font-medium text-[#55585e] mb-2 flex items-center gap-1.5">
          <Icon name="panel" size={13} /> Front panel preview
        </div>
        <div className="flex justify-between gap-2">
          {SAMPLES.map((sm, i) => {
            const on = i % 2 === 1;
            return (
              <figure key={sm.name} className="m-0 flex flex-col items-center gap-1 text-[11px]">
                <span className="block w-[52px] h-[52px]">
                  <SvgView svg={buttonState(svgOf(sm), on ? 'true' : 'false', opts)} label={`${sm.name} button, ${on ? 'true' : 'false'}`} />
                </span>
                <figcaption className="text-[#3a3d42]">
                  {sm.name} <span className="font-mono text-[10px] text-[#7a7d82]">{on ? 'T' : 'F'}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 px-4 py-3 bg-paper text-[#1d1d1f]">
        <span className="flex items-end gap-2.5">
          {[32, 24, 16].map((px) => (
            <SampleIcon key={px} sample={SAMPLES[0]} style={s.style} s={s} size={px} />
          ))}
        </span>
        <span aria-hidden="true" className="w-px h-8 bg-[#e3e5e8]" />
        <span className="flex items-center gap-2" aria-label="States preview">
          {PREVIEW_STATES.map((st) => (
            <span key={st} className="w-8 h-8" title={st}>
              <SvgView svg={statusVariant(svgOf(SAMPLES[0]), st, { onColor: o.stateColor || undefined })} />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function SampleIcon({ sample, style, s, size }: { sample: Sample; style: IconStyle; s: StyleLock; size: number }) {
  if (style === 'pixel') return <PixelSample sample={sample} s={s} size={size} />;
  return (
    <span className="block shrink-0" style={{ width: size, height: size }}>
      <SvgView svg={sampleSvg(sample, style, s)} />
    </span>
  );
}

/** A sample drawn on a 16-pixel grid with hard edges, shown enlarged. */
function PixelSample({ sample, s, size }: { sample: Sample; s: StyleLock; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g || typeof Path2D === 'undefined') return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 16, 16);
    g.setTransform(16 / 24, 0, 0, 16 / 24, 0, 0);
    g.lineWidth = 2.6;
    g.strokeStyle = s.primary;
    g.stroke(new Path2D(sample.body + (sample.lines ?? '')));
    g.strokeStyle = s.colorMode === 'brand' ? s.accent : s.primary;
    g.stroke(new Path2D(sample.part));
    // Hard pixels: every pixel either fully on or off.
    const img = g.getImageData(0, 0, 16, 16);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 100 ? 255 : 0;
    g.putImageData(img, 0, 0);
  }, [sample, s.primary, s.accent, s.colorMode]);
  return <canvas ref={ref} width={16} height={16} style={{ width: size, height: size, imageRendering: 'pixelated' }} aria-hidden="true" />;
}

/** Palette swatches plus a free colour picker. */
function ColorPick({ label, value, colors, onPick }: { label: string; value: string; colors: { role: string; hex: string }[]; onPick: (hex: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <ColorChips label={label} colors={colors} value={value} onChange={onPick} />
      <label title="Pick any color" className="relative w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-ink-3 hover:text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] cursor-pointer">
        <Icon name="plus" size={13} />
        <span className="sr-only">Custom {label.toLowerCase()}</span>
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
    </div>
  );
}

/* ---------- references ---------- */

/** Upload icons from an existing set; new sheets are drawn to match them. */
function References() {
  const { project, update, codec, notify } = useStore();
  const [reading, setReading] = useState(0);
  const refs = project.references ?? [];
  const model = getModel(project.modelId);

  const onFile = async (file: File) => {
    if (!/^image\//.test(file.type)) return notify('References must be PNG, SVG, JPG or WebP images.', 'error');
    setReading((n) => n + 1);
    try {
      const img = await codec.decode(await readFileAsDataUrl(file));
      // Opaque icons (a JPG on white) get their background keyed out, then the same padding as ours.
      const png = await codec.encode(fitSquare(ensureTransparent(img), 256));
      const ref: ReferenceIcon = { id: uid(), name: file.name.replace(/\.[^.]+$/, ''), png };
      update((p) => {
        const list = p.references ?? [];
        if (list.length >= MAX_REFERENCES) return p;
        return { ...p, references: [...list, ref] };
      });
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setReading((n) => n - 1);
    }
  };

  const useColors = async () => {
    try {
      const swatches = (await Promise.all(refs.map(async (r) => extractPalette(await codec.decode(r.png), 3)))).flat();
      const ink = swatches.filter((c) => luminance(c.hex) < 0.85).sort((a, b) => b.share - a.share)[0];
      if (!ink) return notify('No clear icon color found in the references.', 'info');
      update((p) => ({
        ...p,
        brand: p.brand.palette.some((c) => c.hex === ink.hex) ? p.brand : { ...p.brand, palette: [...p.brand.palette, { role: 'Reference', hex: ink.hex }] },
        style: { ...p.style, primary: ink.hex },
      }));
      notify(`Main color set to ${ink.hex.toUpperCase()} from your icons.`, 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3" aria-label="Match an existing icon set">
      <p className="text-[13px] text-ink-2">Add a few icons you already use, like the ones in your LabVIEW project, and new ones are drawn to match them.</p>
      {refs.length ? (
        <ul aria-label="Reference icons" className="grid grid-cols-6 sm:grid-cols-8 gap-2">
          {refs.map((r) => (
            <li key={r.id} className="group relative aspect-square rounded-[8px] bg-paper p-1.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <img src={r.png} alt={r.name} className="w-full h-full object-contain" />
              <button
                type="button"
                aria-label={`Remove reference ${r.name}`}
                onClick={() => update((p) => ({ ...p, references: (p.references ?? []).filter((x) => x.id !== r.id) }))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-card text-ink-2 flex items-center justify-center shadow-sm border border-line opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
              >
                <Icon name="x" size={10} strokeWidth={2.6} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2 items-stretch">
        {refs.length < MAX_REFERENCES ? (
          <div className="flex-1">
            <DropZone accept="image/png,image/svg+xml,image/jpeg,image/webp" onFile={onFile} label="Upload reference icons" multiple>
              <div className="flex items-center gap-2.5 px-3 h-10 text-[13px] text-ink-2">
                {reading ? <Spinner /> : <Icon name="upload" size={16} />}
                Drop up to {MAX_REFERENCES} SVG or PNG icons
              </div>
            </DropZone>
          </div>
        ) : null}
        {refs.length ? (
          <Button size="md" onClick={useColors}>
            Use their color
          </Button>
        ) : null}
      </div>
      {refs.length > 0 && model.maxRefs === 0 ? <p className="text-[12px] text-warning">{model.label} can’t use reference images. Pick another model in Draw to match these.</p> : null}
    </div>
  );
}
