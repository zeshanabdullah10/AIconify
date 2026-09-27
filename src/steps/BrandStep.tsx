import { useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Badge, Button, Card, CardHeader, DropZone, Spinner, TextField, cx } from '../components/ui';
import { logoForVision, readFileAsDataUrl } from '../lib/codec';
import { luminance, normalizeHex, isHex } from '../lib/color';
import { extractPalette } from '../lib/palette';
import { analyzeBrand } from '../lib/pipeline';
import type { BrandKit, PaletteColor, Project } from '../lib/types';
import { errorText, useStore } from '../store';

const ROLES = ['Primary', 'Accent', 'Secondary', 'Surface', 'Ink', 'Warm'];

/** Pick the icon colours from a palette: explicit roles first, then the most "inky" colours. */
export function applyPaletteToStyle(p: Project, palette: PaletteColor[]): Project['style'] {
  const inky = palette.filter((c) => luminance(c.hex) < 0.8);
  const primary = palette.find((c) => /primary/i.test(c.role))?.hex ?? inky[0]?.hex ?? p.style.primary;
  const accent = palette.find((c) => /accent/i.test(c.role) && c.hex !== primary)?.hex ?? inky.find((c) => c.hex !== primary)?.hex ?? p.style.accent;
  return { ...p.style, primary, accent };
}

export function BrandStep({ onNext }: { onNext: () => void }) {
  const { project, update, deps, codec, notify } = useStore();
  const brand = project.brand;
  const [analyzing, setAnalyzing] = useState(false);
  const [reading, setReading] = useState<'logo' | 'pdf' | null>(null);
  const setBrand = (fn: (b: BrandKit) => BrandKit) => update((p) => ({ ...p, brand: fn(p.brand) }));

  const onLogo = async (file: File) => {
    if (!/^image\//.test(file.type)) return notify('Please choose a PNG, JPG, WebP or SVG image.', 'error');
    setReading('logo');
    try {
      const raw = await readFileAsDataUrl(file);
      const img = await codec.decode(raw);
      const png = await codec.encode(img);
      const swatches = extractPalette(img, 6);
      update((p) => {
        const palette = p.brand.palette.length
          ? p.brand.palette
          : swatches.slice(0, 5).map((s, i) => ({ role: ROLES[i] ?? `Color ${i + 1}`, hex: s.hex }));
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
      notify('Brand analyzed. Check the palette and traits, then continue.', 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const canAnalyze = !!(brand.logo || brand.guidelines || brand.notes.trim());

  return (
    <>
      <StepHeader
        eyebrow="Step 1 of 5"
        title="Start with your brand."
        subtitle="Add your logo and, if you have them, brand guidelines. AIconify reads the colors, shapes and personality so every icon feels like yours."
        action={
          <div className="flex gap-2">
            <Button variant="primary" icon="sparkles" busy={analyzing} disabled={!canAnalyze} onClick={analyze}>
              {brand.analyzed ? 'Analyze again' : 'Analyze brand'}
            </Button>
            <Button onClick={onNext} icon="arrowRight" disabled={brand.palette.length === 0}>
              Continue
            </Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader title="Logo" detail="PNG, SVG, JPG or WebP" action={brand.logo ? <Badge tone="success">Added</Badge> : null} />
            <DropZone accept="image/png,image/jpeg,image/webp,image/svg+xml" onFile={onLogo} label="Upload logo">
              {brand.logo ? (
                <div className="checker rounded-[14px] h-48 flex items-center justify-center p-6 m-1.5">
                  <img src={brand.logo.dataUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-ink-2">
                  {reading === 'logo' ? <Spinner size={22} /> : <Icon name="upload" size={26} />}
                  <span className="text-[15px] font-medium text-ink">Drop your logo here</span>
                  <span className="text-[13px]">or click to choose a file</span>
                </div>
              )}
            </DropZone>
            {brand.logo ? <p className="text-[12px] text-ink-3 mt-2 truncate">{brand.logo.fileName} · click the image to replace it</p> : null}
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader title="Brand guidelines" detail="Optional PDF. Text is read in your browser." />
            <DropZone accept="application/pdf" onFile={onPdf} label="Upload brand guidelines PDF">
              <div className="flex items-center gap-3 p-4">
                <span className="w-10 h-10 rounded-[10px] bg-fill flex items-center justify-center text-ink-2">
                  {reading === 'pdf' ? <Spinner /> : <Icon name="file" size={20} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{brand.guidelines ? brand.guidelines.fileName : 'Add a PDF'}</span>
                  <span className="block text-[13px] text-ink-2">
                    {brand.guidelines ? `${brand.guidelines.pages} pages · ${brand.guidelines.text.length.toLocaleString()} characters read` : 'Colors, typography, do and don’t rules'}
                  </span>
                </span>
                {brand.guidelines ? <Badge tone="success">Read</Badge> : null}
              </div>
            </DropZone>
          </Card>

          <Card className="p-5 sm:p-6 flex flex-col gap-4">
            <TextField label="Brand name" value={brand.name} onChange={(v) => setBrand((b) => ({ ...b, name: v }))} placeholder="Fernleaf Coffee" />
            <TextField
              label="Anything else we should know?"
              multiline
              value={brand.notes}
              onChange={(v) => setBrand((b) => ({ ...b, notes: v }))}
              placeholder="What the icons are for, who uses them, the feeling you want."
            />
          </Card>
        </div>

        <Card className="p-5 sm:p-6 flex flex-col gap-6" aria-label="What we found">
          <PaletteEditor palette={brand.palette} onChange={(palette) => update((p) => ({ ...p, brand: { ...p.brand, palette }, style: applyPaletteToStyle(p, palette) }))} />
          <ListEditor title="Personality" items={brand.traits} placeholder="Add a trait, e.g. friendly" onChange={(traits) => setBrand((b) => ({ ...b, traits }))} chips />
          <div className="grid sm:grid-cols-2 gap-5">
            <ListEditor title="Do" items={brand.dos} placeholder="Add a rule" onChange={(dos) => setBrand((b) => ({ ...b, dos }))} />
            <ListEditor title="Don’t" items={brand.donts} placeholder="Add a rule" onChange={(donts) => setBrand((b) => ({ ...b, donts }))} />
          </div>
          {brand.fonts.display || brand.fonts.body ? (
            <div className="flex gap-8 pt-4 border-t border-line text-[13px]">
              {brand.fonts.display ? (
                <div>
                  <div className="text-ink-2">Display type</div>
                  <div className="font-semibold text-[15px]">{brand.fonts.display}</div>
                </div>
              ) : null}
              {brand.fonts.body ? (
                <div>
                  <div className="text-ink-2">Body type</div>
                  <div className="font-semibold text-[15px]">{brand.fonts.body}</div>
                </div>
              ) : null}
            </div>
          ) : null}
          {!brand.analyzed ? (
            <p className="text-[13px] text-ink-2 mt-auto flex items-center gap-2">
              <Icon name="sparkles" size={15} className="text-accent" />
              Analyze brand fills this in with DeepSeek V4.1 Flash, for well under a cent.
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function PaletteEditor({ palette, onChange }: { palette: PaletteColor[]; onChange: (p: PaletteColor[]) => void }) {
  const set = (i: number, patch: Partial<PaletteColor>) => onChange(palette.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <div>
      <CardHeader
        title="Palette"
        detail="The first color is used for icons. Click a swatch to change it."
        action={
          palette.length < 8 ? (
            <Button size="sm" icon="plus" onClick={() => onChange([...palette, { role: ROLES[palette.length] ?? `Color ${palette.length + 1}`, hex: '#888888' }])}>
              Add
            </Button>
          ) : null
        }
      />
      {palette.length === 0 ? (
        <div className="rounded-[14px] bg-fill/60 p-5 text-[14px] text-ink-2">Add a logo to pull its colors, or add them by hand.</div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {palette.map((c, i) => (
            <li key={i} className="group relative rounded-[14px] bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] p-2.5">
              <label className="block h-14 rounded-[10px] cursor-pointer shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" style={{ background: c.hex }}>
                <span className="sr-only">Color for {c.role}</span>
                <input type="color" value={c.hex} onChange={(e) => set(i, { hex: e.target.value })} className="opacity-0 w-full h-full cursor-pointer" />
              </label>
              <input
                aria-label="Role"
                value={c.role}
                onChange={(e) => set(i, { role: e.target.value })}
                className="mt-2 w-full bg-transparent text-[13px] font-semibold outline-none"
              />
              <input
                aria-label="Hex value"
                defaultValue={c.hex}
                key={c.hex}
                onBlur={(e) => (isHex(e.target.value) ? set(i, { hex: normalizeHex(e.target.value) }) : (e.target.value = c.hex))}
                className="w-full bg-transparent text-[12px] font-mono text-ink-2 outline-none uppercase"
              />
              <button
                type="button"
                aria-label={`Remove ${c.role}`}
                onClick={() => onChange(palette.filter((_, k) => k !== i))}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-card/90 text-ink-2 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer shadow-sm"
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
    <div>
      <h3 className="text-[13px] font-semibold text-ink-2 mb-2">{title}</h3>
      <ul className={cx(chips ? 'flex flex-wrap gap-2' : 'flex flex-col gap-1.5', 'mb-2')}>
        {items.map((it) => (
          <li key={it} className={cx('group inline-flex items-center gap-1.5 text-[14px]', chips && 'h-8 pl-3 pr-1.5 rounded-full bg-accent-soft text-accent font-medium')}>
            {!chips ? <span className="w-1 h-1 rounded-full bg-ink-3" /> : null}
            <span className="flex-1">{it}</span>
            <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))} className="w-5 h-5 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer">
              <Icon name="x" size={11} strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ul>
      <input
        aria-label={`Add to ${title}`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        onBlur={add}
        className="w-full h-9 bg-transparent text-[14px] outline-none border-b border-line focus:border-accent placeholder:text-ink-3"
      />
    </div>
  );
}
