import { useState } from 'react';
import { StepHeader, Swatch } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Button, Card, CardHeader, DropZone, Segmented, Spinner, cx } from '../components/ui';
import { readFileAsDataUrl } from '../lib/codec';
import { luminance } from '../lib/color';
import { getModel } from '../lib/models';
import { extractPalette } from '../lib/palette';
import { MAX_PER_SHEET, suggestIcons, uid } from '../lib/pipeline';
import { ensureTransparent, fitSquare } from '../lib/raster';
import { ICON_PACKS } from '../lib/presets';
import { STYLE_LABELS, styleLock } from '../lib/prompts';
import type { IconStyle, ReferenceIcon, StyleLock } from '../lib/types';
import { errorText, useStore } from '../store';

const SAMPLE = [
  'M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2',
  'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM10 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  'M3 11l9-7 9 7M5 10v10h14V10',
];

export function StylePreview({ style, s, size = 30 }: { style: IconStyle; s: StyleLock; size?: number }) {
  const round = s.corners === 'rounded';
  return (
    <span className="flex gap-2">
      {SAMPLE.map((d) => (
        <span key={d} className="flex items-center justify-center rounded-[11px]" style={{ width: size + 18, height: size + 18, background: style === 'badge' ? s.primary : 'var(--color-paper-2)' }}>
          <svg width={size} height={size} viewBox="0 0 24 24" strokeLinecap={round ? 'round' : 'square'} strokeLinejoin={round ? 'round' : 'miter'} aria-hidden="true">
            {style === 'duotone' ? <path d={d} fill={s.colorMode === 'brand' ? s.accent : s.primary} fillOpacity={0.35} /> : null}
            <path
              d={d}
              fill={style === 'filled' ? s.primary : 'none'}
              stroke={style === 'badge' ? '#ffffff' : s.primary}
              strokeWidth={style === 'filled' ? 1 : s.strokeWeight}
            />
          </svg>
        </span>
      ))}
    </span>
  );
}

export function StyleStep({ onNext }: { onNext: () => void }) {
  const { project, update, deps, notify } = useStore();
  const s = project.style;
  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const setStyle = (patch: Partial<StyleLock>) => update((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const names = project.iconNames;
  const setNames = (fn: (n: string[]) => string[]) => update((p) => ({ ...p, iconNames: fn(p.iconNames) }));

  const add = (list: string[]) =>
    setNames((n) => {
      const lower = new Set(n.map((x) => x.toLowerCase()));
      return [...n, ...list.map((x) => x.trim()).filter((x) => x && !lower.has(x.toLowerCase()))].slice(0, 64);
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

  const sheets = Math.ceil(names.length / MAX_PER_SHEET);
  const base = project.brand.palette.length ? project.brand.palette : [{ role: 'Ink', hex: s.primary }];
  const colors = s.hmi && !base.some((c) => c.hex === HMI_GREY) ? [...base, { role: 'HMI grey', hex: HMI_GREY }] : base;

  return (
    <>
      <StepHeader
        eyebrow="Step 2 of 5"
        title="Lock one look for the set."
        subtitle="Every icon is drawn with the same style, stroke and colors. Then pick which icons you need."
        action={
          <Button variant="primary" icon="arrowRight" onClick={onNext} disabled={names.length === 0}>
            Continue
          </Button>
        }
      />
      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-5">
        <div className="flex flex-col gap-5">
        <Card className="p-5 sm:p-6 flex flex-col gap-6">
          <div>
            <CardHeader title="Icon style" />
            <div role="radiogroup" aria-label="Icon style" className="grid sm:grid-cols-2 gap-3">
              {(Object.keys(STYLE_LABELS) as IconStyle[]).map((id) => {
                const on = s.style === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStyle({ style: id })}
                    className={cx(
                      'text-left p-4 rounded-[18px] flex flex-col gap-3 transition-all cursor-pointer',
                      on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                    )}
                  >
                    <StylePreview style={id} s={s} size={24} />
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] font-semibold">{STYLE_LABELS[id].name}</span>
                      <span className="text-[13px] text-ink-2">{STYLE_LABELS[id].hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-5 border-t border-line">
            <Row label="Stroke">
              <Segmented label="Stroke weight" value={s.strokeWeight} onChange={(v) => setStyle({ strokeWeight: v })} options={[1.5, 2, 2.5].map((v) => ({ value: v, label: `${v} px` }))} />
            </Row>
            <Row label="Corners">
              <Segmented label="Corners" value={s.corners} onChange={(v) => setStyle({ corners: v })} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'sharp', label: 'Sharp' }]} />
            </Row>
            <Row label="Look">
              <Segmented
                label="Look"
                value={s.hmi ? 'hmi' : 'brand'}
                onChange={(v) => setStyle(v === 'hmi' ? { hmi: true, colorMode: 'mono', primary: HMI_GREY } : { hmi: false })}
                options={[
                  { value: 'brand', label: 'Brand' },
                  { value: 'hmi', label: 'Industrial HMI' },
                ]}
              />
            </Row>
            {s.hmi ? (
              <p className="text-[13px] text-ink-2 -mt-2 sm:pl-28">
                ISA-101 style: muted grey symbols. Color is kept for alarm and warning states, which you can export in step 5.
              </p>
            ) : null}
            <Row label="Colors">
              <Segmented label="Color mode" value={s.colorMode} onChange={(v) => setStyle({ colorMode: v })} options={[{ value: 'brand', label: 'Brand' }, { value: 'mono', label: 'One color' }]} />
            </Row>
            <Row label="Main color">
              <ColorPicker value={s.primary} colors={colors} onPick={(hex) => setStyle({ primary: hex })} label="Main color" />
            </Row>
            {s.colorMode === 'brand' && (s.style === 'duotone' || s.style === 'badge') ? (
              <Row label="Accent">
                <ColorPicker value={s.accent} colors={colors} onPick={(hex) => setStyle({ accent: hex })} label="Accent color" />
              </Row>
            ) : null}
          </div>
        </Card>
        <References />
        </div>

        <Card className="p-5 sm:p-6 flex flex-col gap-5">
          <CardHeader
            title="Icons in this set"
            detail={names.length ? `${names.length} icons · ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} of up to 16` : 'Pick a pack, type your own, or ask for suggestions'}
            action={names.length ? (
              <Button size="sm" variant="plain" onClick={() => setNames(() => [])}>
                Clear
              </Button>
            ) : null}
          />
          <div className="flex flex-wrap gap-2">
            {Object.entries(ICON_PACKS).map(([pack, list]) => (
              <Button key={pack} size="sm" icon="plus" onClick={() => add(list)}>
                {pack}
              </Button>
            ))}
          </div>
          <ul aria-label="Icon names" className="flex flex-wrap gap-2 min-h-[44px]">
            {names.map((n) => (
              <li key={n} className="inline-flex items-center h-9 pl-3.5 pr-1.5 gap-1 rounded-full bg-fill text-[14px] font-medium">
                {n}
                <button type="button" aria-label={`Remove ${n}`} onClick={() => setNames((x) => x.filter((y) => y !== n))} className="w-6 h-6 rounded-full text-ink-3 hover:text-ink hover:bg-fill-2 flex items-center justify-center cursor-pointer">
                  <Icon name="x" size={12} strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
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
                placeholder="Add icons, comma separated"
                className="w-full h-10 px-4 rounded-full bg-fill text-[15px] outline-none border border-transparent focus:border-accent focus:bg-card placeholder:text-ink-3"
              />
            </label>
            <Button icon="sparkles" busy={suggesting} onClick={suggest}>
              Suggest
            </Button>
          </div>
          <details className="group mt-auto rounded-[14px] bg-fill/60">
            <summary className="cursor-pointer list-none flex items-center gap-2 px-4 h-11 text-[13px] font-medium text-ink-2">
              <Icon name="chevronDown" size={15} className="transition-transform group-open:rotate-180" />
              Style prompt sent with every sheet
            </summary>
            <p className="px-4 pb-4 text-[13px] leading-relaxed font-mono text-ink-2">{styleLock(s, project.brand)}</p>
          </details>
        </Card>
      </div>
    </>
  );
}

const HMI_GREY = '#4d4d4d';
const MAX_REFERENCES = 8;

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
    <Card className="p-5 sm:p-6 flex flex-col gap-4" aria-label="Match an existing icon set">
      <CardHeader
        title="Match an existing icon set"
        detail="Optional. Add a few icons you already use and new ones are drawn to match them."
        action={refs.length ? <Button size="sm" onClick={useColors}>Use their color</Button> : null}
      />
      {refs.length ? (
        <ul aria-label="Reference icons" className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {refs.map((r) => (
            <li key={r.id} className="group relative aspect-square rounded-[12px] bg-paper p-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <img src={r.png} alt={r.name} className="w-full h-full object-contain" />
              <button
                type="button"
                aria-label={`Remove reference ${r.name}`}
                onClick={() => update((p) => ({ ...p, references: (p.references ?? []).filter((x) => x.id !== r.id) }))}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-card text-ink-2 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
              >
                <Icon name="x" size={12} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {refs.length < MAX_REFERENCES ? (
        <DropZone accept="image/png,image/svg+xml,image/jpeg,image/webp" onFile={onFile} label="Upload reference icons" multiple>
          <div className="flex items-center gap-3 p-4 text-[14px] text-ink-2">
            {reading ? <Spinner /> : <Icon name="upload" size={18} />}
            Drop up to {MAX_REFERENCES} icons (SVG or PNG), or click to choose
          </div>
        </DropZone>
      ) : null}
      {refs.length > 0 && model.maxRefs === 0 ? (
        <p className="text-[13px] text-warning">{model.label} can’t use reference images. Pick another model in step 3 to match these.</p>
      ) : null}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="w-24 text-[14px] text-ink-2">{label}</span>
      {children}
    </div>
  );
}

function ColorPicker({ value, colors, onPick, label }: { value: string; colors: { role: string; hex: string }[]; onPick: (hex: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2 flex-wrap">
      {colors.map((c) => (
        <button
          key={c.hex + c.role}
          type="button"
          role="radio"
          aria-checked={value === c.hex}
          aria-label={`${c.role} ${c.hex}`}
          onClick={() => onPick(c.hex)}
          className={cx('rounded-full p-[3px] cursor-pointer transition-shadow', value === c.hex ? 'shadow-[0_0_0_2px_var(--color-accent)]' : 'hover:shadow-[0_0_0_2px_var(--color-line-strong)]')}
        >
          <Swatch hex={c.hex} size={26} label={c.role} />
        </button>
      ))}
    </div>
  );
}
