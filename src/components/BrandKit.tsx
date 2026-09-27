import { useState } from 'react';
import { Icon } from './icons';
import { Button, DropZone, Spinner, TextField, cx } from './ui';
import { logoForVision, readFileAsDataUrl } from '../lib/codec';
import { isHex, luminance, normalizeHex } from '../lib/color';
import { extractPalette } from '../lib/palette';
import { analyzeBrand } from '../lib/pipeline';
import type { BrandKit as Kit, PaletteColor, Project } from '../lib/types';
import { errorText, useStore } from '../store';

const ROLES = ['Primary', 'Accent', 'Secondary', 'Surface', 'Ink', 'Warm'];

/** Pick the icon colours from a palette: explicit roles first, then the most "inky" colours. */
export function applyPaletteToStyle(p: Project, palette: PaletteColor[]): Project['style'] {
  if (p.style.hmi) return p.style;
  const inky = palette.filter((c) => luminance(c.hex) < 0.8);
  const primary = palette.find((c) => /primary/i.test(c.role))?.hex ?? inky[0]?.hex ?? p.style.primary;
  const accent = palette.find((c) => /accent/i.test(c.role) && c.hex !== primary)?.hex ?? inky.find((c) => c.hex !== primary)?.hex ?? p.style.accent;
  return { ...p.style, primary, accent };
}

/**
 * Optional brand input: a logo and guidelines, read by a cheap text model into colours, traits and
 * rules. Everything it fills in can be edited by hand.
 */
export function BrandKit() {
  const { project, update, deps, codec, notify } = useStore();
  const brand = project.brand;
  const [analyzing, setAnalyzing] = useState(false);
  const [reading, setReading] = useState<'logo' | 'pdf' | null>(null);
  const setBrand = (fn: (b: Kit) => Kit) => update((p) => ({ ...p, brand: fn(p.brand) }));

  const onLogo = async (file: File) => {
    if (!/^image\//.test(file.type)) return notify('Please choose a PNG, JPG, WebP or SVG image.', 'error');
    setReading('logo');
    try {
      const raw = await readFileAsDataUrl(file);
      const img = await codec.decode(raw);
      const png = await codec.encode(img);
      const swatches = extractPalette(img, 6);
      update((p) => {
        const palette = p.brand.palette.length ? p.brand.palette : swatches.slice(0, 5).map((s, i) => ({ role: ROLES[i] ?? `Color ${i + 1}`, hex: s.hex }));
        return {
          ...p,
          brand: { ...p.brand, logo: { dataUrl: png, fileName: file.name }, palette, analyzed: false },
          style: p.brand.palette.length ? p.style : applyPaletteToStyle(p, palette),
        };
      });
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setReading(null);
    }
  };

  const onPdf = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return notify('Brand guidelines must be a PDF.', 'error');
    setReading('pdf');
    try {
      const { pdfText } = await import('../lib/pdf');
      const { text, pages } = await pdfText(await file.arrayBuffer());
      setBrand((b) => ({ ...b, guidelines: { fileName: file.name, pages, text }, analyzed: false }));
      if (!text) notify('That PDF has no selectable text, so only its file name will be used.', 'info');
    } catch (e) {
      notify(`Could not read that PDF: ${errorText(e)}`, 'error');
    } finally {
      setReading(null);
    }
  };

  const analyze = async () => {
    const d = deps();
    if (!d) return;
    setAnalyzing(true);
    try {
      const vision = brand.logo ? await logoForVision(brand.logo.dataUrl, codec) : undefined;
      const { brand: next, analysis } = await analyzeBrand(d, brand, vision);
      update((p) => ({
        ...p,
        brand: next,
        style: {
          ...applyPaletteToStyle(p, next.palette),
          style: analysis.style?.style ?? p.style.style,
          corners: analysis.style?.corners ?? p.style.corners,
          strokeWeight: analysis.style?.strokeWeight ?? p.style.strokeWeight,
        },
        iconNames: p.iconNames.length ? p.iconNames : analysis.suggestedIcons.slice(0, 16),
      }));
      notify('Brand analyzed. Colors, traits and rules are filled in.', 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const canAnalyze = !!(brand.logo || brand.guidelines || brand.notes.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <DropZone accept="image/png,image/jpeg,image/webp,image/svg+xml" onFile={onLogo} label="Upload logo">
          <div className="checker rounded-[9px] h-[96px] flex items-center justify-center p-2 m-px">
            {reading === 'logo' ? (
              <Spinner size={20} />
            ) : brand.logo ? (
              <img src={brand.logo.dataUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[11px] text-ink-2 text-center leading-tight">
                <Icon name="upload" size={18} />
                Logo
              </span>
            )}
          </div>
        </DropZone>
        <div className="flex flex-col gap-2 min-w-0">
          <DropZone accept="application/pdf" onFile={onPdf} label="Upload brand guidelines PDF">
            <div className="flex items-center gap-2.5 px-3 h-11">
              {reading === 'pdf' ? <Spinner /> : <Icon name="file" size={17} className="text-ink-2 shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate">{brand.guidelines ? brand.guidelines.fileName : 'Guidelines PDF'}</span>
                <span className="block text-[11px] text-ink-3 truncate">
                  {brand.guidelines ? `${brand.guidelines.pages} pages · ${brand.guidelines.text.length.toLocaleString()} characters read` : 'Read in your browser'}
                </span>
              </span>
            </div>
          </DropZone>
          <Button variant={brand.analyzed ? 'secondary' : 'primary'} size="sm" icon="sparkles" busy={analyzing} disabled={!canAnalyze} onClick={analyze}>
            {brand.analyzed ? 'Analyze again' : 'Analyze brand'}
          </Button>
        </div>
      </div>
      <TextField
        label="Anything else we should know?"
        multiline
        rows={2}
        value={brand.notes}
        onChange={(v) => setBrand((b) => ({ ...b, notes: v }))}
        placeholder="Who uses the app, where it runs, the feeling you want."
      />
      <PaletteEditor palette={brand.palette} onChange={(palette) => update((p) => ({ ...p, brand: { ...p.brand, palette }, style: applyPaletteToStyle(p, palette) }))} />
      <ListEditor title="Personality" items={brand.traits} placeholder="Add a trait, e.g. precise" onChange={(traits) => setBrand((b) => ({ ...b, traits }))} chips />
      <div className="grid grid-cols-2 gap-4">
        <ListEditor title="Do" items={brand.dos} placeholder="Add a rule" onChange={(dos) => setBrand((b) => ({ ...b, dos }))} />
        <ListEditor title="Don’t" items={brand.donts} placeholder="Add a rule" onChange={(donts) => setBrand((b) => ({ ...b, donts }))} />
      </div>
      {!brand.analyzed ? <p className="text-[12px] text-ink-3">Analyze uses DeepSeek V4.1 Flash, well under a cent.</p> : null}
    </div>
  );
}

function PaletteEditor({ palette, onChange }: { palette: PaletteColor[]; onChange: (p: PaletteColor[]) => void }) {
  const set = (i: number, patch: Partial<PaletteColor>) => onChange(palette.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <div>
      <div className="flex items-center mb-2">
        <h3 className="flex-1 label-caps">Palette</h3>
        {palette.length < 8 ? (
          <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange([...palette, { role: ROLES[palette.length] ?? `Color ${palette.length + 1}`, hex: '#888888' }])}>
            Add
          </Button>
        ) : null}
      </div>
      {palette.length === 0 ? (
        <p className="text-[12px] text-ink-3">Add a logo to pull its colors, or add them by hand.</p>
      ) : (
        <ul aria-label="Palette" className="flex flex-col gap-1">
          {palette.map((c, i) => (
            <li key={i} className="group flex items-center gap-2 h-8">
              <label className="relative w-6 h-6 rounded-[6px] cursor-pointer shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] shrink-0" style={{ background: c.hex }}>
                <span className="sr-only">Color for {c.role}</span>
                <input type="color" value={c.hex} onChange={(e) => set(i, { hex: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <input aria-label="Role" value={c.role} onChange={(e) => set(i, { role: e.target.value })} className="flex-1 min-w-0 bg-transparent text-[13px] font-medium outline-none rounded px-1 focus:bg-fill" />
              <input
                aria-label="Hex value"
                defaultValue={c.hex}
                key={c.hex}
                onBlur={(e) => (isHex(e.target.value) ? set(i, { hex: normalizeHex(e.target.value) }) : (e.target.value = c.hex))}
                className="w-[76px] bg-transparent text-[12px] font-mono text-ink-2 outline-none uppercase rounded px-1 focus:bg-fill"
              />
              <button
                type="button"
                aria-label={`Remove ${c.role}`}
                onClick={() => onChange(palette.filter((_, k) => k !== i))}
                className="w-6 h-6 rounded-[6px] text-ink-3 hover:text-ink hover:bg-fill flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
              >
                <Icon name="x" size={12} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListEditor({ title, items, onChange, placeholder, chips }: { title: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; chips?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="min-w-0">
      <h3 className="label-caps mb-1.5">{title}</h3>
      {items.length ? (
        <ul className={cx(chips ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-1', 'mb-1.5')}>
          {items.map((it) => (
            <li key={it} className={cx('group inline-flex items-center gap-1 text-[13px]', chips && 'h-7 pl-2.5 pr-1 rounded-[6px] bg-accent-soft text-accent font-medium')}>
              <span className="flex-1 min-w-0 truncate">{it}</span>
              <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))} className="w-5 h-5 rounded flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer">
                <Icon name="x" size={11} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        aria-label={`Add to ${title}`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        onBlur={add}
        className="w-full h-8 bg-transparent text-[13px] outline-none border-b border-line focus:border-accent placeholder:text-ink-3"
      />
    </div>
  );
}

/** One line for a closed Brand kit section. */
export function brandSummary(brand: Kit): string {
  const bits = [brand.logo ? 'logo' : '', brand.guidelines ? 'guidelines' : '', brand.palette.length ? `${brand.palette.length} colors` : ''].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'Optional';
}

