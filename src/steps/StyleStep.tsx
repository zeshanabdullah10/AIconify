import { useState } from 'react';
import { StepHeader, Swatch } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Button, Card, CardHeader, Segmented, cx } from '../components/ui';
import { MAX_PER_SHEET, suggestIcons } from '../lib/pipeline';
import { ICON_PACKS } from '../lib/presets';
import { STYLE_LABELS, styleLock } from '../lib/prompts';
import type { IconStyle, StyleLock } from '../lib/types';
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
  const colors = project.brand.palette.length ? project.brand.palette : [{ role: 'Ink', hex: s.primary }];

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
