import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar, Stat } from '../components/ActionBar';
import { Icon } from '../components/icons';
import { Badge, Button, Card, Dialog, Segmented, Spinner, SvgView, TextField, cx, inputCls } from '../components/ui';
import { buttonOptions, iconAt } from '../lib/exporter';
import { buttonState, statusVariant, viIcon } from '../lib/labview';
import { estimateSheets, formatUsd, getModel, IMAGE_MODELS } from '../lib/models';
import { applyCandidate, editIcon, generateIcons, iconVariations, MAX_PER_SHEET, retraceAll, type ProcessedCell } from '../lib/pipeline';
import { CHECK_FIX, CHECK_TEXT, checkSet, type CheckId } from '../lib/quality';
import { fileName } from '../lib/svg';
import type { IconItem, Project, SheetRun } from '../lib/types';
import { errorText, useStore } from '../store';

type Stage = 'brief' | 'image' | 'trace' | 'done';
const STAGES: { id: Exclude<Stage, 'done'>; label: string }[] = [
  { id: 'brief', label: 'Writing briefs' },
  { id: 'image', label: 'Drawing sheet' },
  { id: 'trace', label: 'Cutting & tracing' },
];

export const FLAG_TEXT: Record<string, string> = {
  missing: 'Nothing was drawn in this cell.',
  'overlaps-neighbour': 'This icon spills into a neighbouring cell. Check its edges.',
  'very-small': 'Much smaller than the other icons.',
  fragmented: 'Made of many separate pieces. Check it for stray marks.',
};

/** Names that still need drawing: everything without an approved icon. */
export function pendingNames(p: Project): string[] {
  const approved = new Set(p.icons.filter((i) => i.status === 'approved').map((i) => i.name.toLowerCase()));
  return p.iconNames.filter((n) => !approved.has(n.toLowerCase()));
}

export function mergeIcons(existing: IconItem[], fresh: IconItem[]): IconItem[] {
  const replaced = new Set(fresh.map((i) => i.name.toLowerCase()));
  const kept = existing.filter((i) => i.status === 'approved' || !replaced.has(i.name.toLowerCase()));
  return [...kept, ...fresh];
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function replaceIcon(p: Project, id: string, cell: ProcessedCell, note: string): Project {
  return {
    ...p,
    icons: p.icons.map((i) =>
      i.id === id
        ? {
            ...i,
            history: i.svg && i.png ? [{ svg: i.svg, png: i.png, note, at: Date.now() }, ...i.history].slice(0, 10) : i.history,
            svg: cell.svg || i.svg,
            png: cell.png,
            flags: cell.flags,
            status: cell.flags.length ? 'flagged' : 'draft',
          }
        : i,
    ),
  };
}

type View = 'icons' | 'buttons' | 'dark';

export function DrawStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { project, update, deps, codec, notify } = useStore();
  const icons = project.icons;
  const [stage, setStage] = useState<Stage | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(icons[0]?.id ?? null);
  const [view, setView] = useState<View>('icons');
  const [size, setSize] = useState<24 | 48>(48);
  const [adding, setAdding] = useState(false);
  const [newNames, setNewNames] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const model = getModel(project.modelId);
  const each = model.estimate[model.quality ? project.quality : 'low'];
  const names = pendingNames(project);
  const sheets = Math.ceil(names.length / MAX_PER_SHEET);
  const estimate = estimateSheets(project.modelId, project.quality, sheets, project.candidates) + 0.0005;
  const drafts = icons.filter((i) => i.status !== 'approved' && names.some((n) => n.toLowerCase() === i.name.toLowerCase()));
  const approved = icons.filter((i) => i.status === 'approved').length;
  const checks = useMemo(() => checkSet(icons, project.style), [icons, project.style]);
  const noted = Object.keys(checks).length;
  const selected = icons.find((i) => i.id === sel) ?? icons[0];
  const running = stage !== null && stage !== 'done';
  // Names with no icon yet are shown as empty tiles, so you see what the sheet will hold.
  const have = new Set(icons.map((i) => i.name.toLowerCase()));
  const waiting = project.iconNames.filter((n) => !have.has(n.toLowerCase()));
  const latestRuns = useMemo(() => {
    const ids = new Set(project.icons.map((i) => i.runId));
    return project.runs.filter((r) => ids.has(r.id)).slice(-3);
  }, [project.icons, project.runs]);

  useEffect(() => {
    if (!icons.find((i) => i.id === sel) && icons[0]) setSel(icons[0].id);
  }, [icons, sel]);

  const run = async () => {
    setConfirm(false);
    const d = deps();
    if (!d) return;
    abort.current = new AbortController();
    try {
      const res = await generateIcons({ ...d, signal: abort.current.signal, onStage: (s, det) => (setStage(s), setDetail(det)) }, project, names);
      update((p) => ({ ...p, runs: [...p.runs, ...res.runs].slice(-12), icons: mergeIcons(p.icons, res.icons) }));
      setStage('done');
      if (res.icons[0]) setSel(res.icons[0].id);
      const flagged = res.icons.filter((i) => i.flags.length).length;
      notify(flagged ? `${res.icons.length} icons ready. ${flagged} need a look.` : `${res.icons.length} icons ready.`, 'success');
    } catch (e) {
      setStage(null);
      if ((e as Error).name !== 'AbortError') notify(errorText(e), 'error');
    }
  };

  const pickCandidate = async (r: SheetRun, index: number) => {
    setSwitching(r.id);
    try {
      const cells = await applyCandidate(codec, project, r, index);
      update((p) => ({
        ...p,
        runs: p.runs.map((x) => (x.id === r.id ? { ...x, chosen: index } : x)),
        icons: p.icons.map((icon) => {
          if (icon.runId !== r.id || icon.cell == null || icon.status === 'approved') return icon;
          const c = cells[icon.cell];
          return { ...icon, png: c.png, svg: c.svg || undefined, flags: c.flags, status: c.flags.length ? 'flagged' : 'draft' };
        }),
      }));
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setSwitching(null);
    }
  };

  const addIcons = async () => {
    const list = newNames.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    const d = deps();
    if (!d) return;
    setAdding(false);
    setBusy('add');
    try {
      const res = await generateIcons(d, project, list);
      update((p) => ({
        ...p,
        iconNames: [...p.iconNames, ...list.filter((n) => !p.iconNames.includes(n))],
        runs: [...p.runs, ...res.runs].slice(-12),
        icons: mergeIcons(p.icons, res.icons),
      }));
      setNewNames('');
      notify(`Added ${res.icons.length} icons${approved ? ', matched to your approved ones' : ''}.`, 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const retrace = async () => {
    setBusy('retrace');
    try {
      const next = await retraceAll(codec, project);
      update((p) => ({ ...p, icons: next }));
      notify('Re-traced every icon with the current colors.', 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (id: string, status: IconItem['status']) => update((p) => ({ ...p, icons: p.icons.map((i) => (i.id === id ? { ...i, status } : i)) }));

  if (!icons.length && !project.iconNames.length) {
    return (
      <Card className="p-10 flex flex-col items-center text-center gap-3 grid-paper">
        <span className="w-12 h-12 rounded-[10px] bg-card border border-line flex items-center justify-center text-ink-2">
          <Icon name="grid" size={22} />
        </span>
        <h1 className="text-[18px] font-semibold">No icons picked yet</h1>
        <p className="text-ink-2 max-w-[360px]">Choose a pack or type the icons you need, then come back to draw them.</p>
        <Button variant="primary" icon="arrowLeft" onClick={onBack}>
          Back to Set up
        </Button>
      </Card>
    );
  }

  const tileBg = view === 'dark' ? 'bg-[#16191e]' : 'bg-paper';
  const opts = buttonOptions(project, project.exportOptions);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Draw and review</h1>
          <p className="text-[14px] text-ink-2 mt-0.5">Up to 16 icons are drawn on one sheet so they match, then cut apart and traced to SVG. Approve the ones you like.</p>
        </div>
      </div>

      {/* Generate toolbar */}
      <Card className="p-3 mb-4" aria-label="Generate">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <label className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] text-ink-2 shrink-0">Model</span>
            <select
              aria-label="Image model"
              value={project.modelId}
              onChange={(e) => update((p) => ({ ...p, modelId: e.target.value, candidates: Math.min(p.candidates, getModel(e.target.value).maxN === 1 ? 2 : p.candidates) }))}
              className={cx(inputCls, 'h-9 w-auto max-w-[300px] pr-8 cursor-pointer')}
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · ~{formatUsd(m.estimate[m.quality ? project.quality : 'low'])}
                </option>
              ))}
            </select>
          </label>
          {model.quality ? (
            <span className="flex items-center gap-2">
              <span className="text-[13px] text-ink-2">Quality</span>
              <Segmented size="sm" label="Quality" value={project.quality} onChange={(v) => update((p) => ({ ...p, quality: v }))} options={[{ value: 'low', label: 'Draft' }, { value: 'medium', label: 'Standard' }]} />
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <span className="text-[13px] text-ink-2">Options</span>
            <Segmented size="sm" label="Options per sheet" value={project.candidates} onChange={(v) => update((p) => ({ ...p, candidates: v }))} options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))} />
          </span>
          <span className="flex-1" />
          <span className="text-[13px] text-ink-2">
            {names.length} to draw · <span className="font-mono tabular-nums text-ink">~{formatUsd(estimate)}</span>
          </span>
          {running ? (
            <Button onClick={() => abort.current?.abort()}>
              <Spinner size={15} /> Cancel
            </Button>
          ) : (
            <Button variant="primary" icon="sparkles" disabled={names.length === 0} onClick={() => (drafts.length ? setConfirm(true) : run())}>
              {names.length === 0 ? 'All icons approved' : latestRuns.length ? 'Generate again' : 'Generate icons'}
            </Button>
          )}
        </div>
        <p className="text-[12px] text-ink-3 mt-2">{model.blurb}.</p>
        {running ? <Progress stage={stage!} detail={detail} /> : null}
      </Card>

      {latestRuns.length ? (
        <div className="flex flex-col gap-2 mb-4">
          {latestRuns.map((r) => (
            <SheetStrip key={r.id} run={r} onPick={(i) => pickCandidate(r, i)} switching={switching === r.id} />
          ))}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line">
            <span className="flex-1 min-w-0 text-[13px] text-ink-2">
              <span className="text-ink font-medium">{project.brand.name ? `${project.brand.name}: ` : ''}</span>
              {icons.length} icons · {approved} approved{noted ? ` · ${noted} with notes` : ''}
            </span>
            <Segmented size="sm" label="Show as" value={view} onChange={setView} options={[{ value: 'icons', label: 'Icons' }, { value: 'buttons', label: 'Buttons' }, { value: 'dark', label: 'Dark' }]} />
            <Segmented size="sm" label="Preview size" value={size} onChange={setSize} options={[{ value: 24, label: '24' }, { value: 48, label: '48' }]} />
          </div>
          <ul className={cx('grid gap-2 p-3', size === 48 ? 'grid-cols-3 sm:grid-cols-5 xl:grid-cols-7' : 'grid-cols-4 sm:grid-cols-7 xl:grid-cols-9', view === 'buttons' ? 'panel-face' : view === 'dark' ? 'bg-[#0d0f12]' : 'grid-paper')}>
            {icons.map((i) => {
              const on = selected?.id === i.id;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${i.name}, ${i.status}${checks[i.id] ? ', has notes' : ''}`}
                    onClick={() => setSel(i.id)}
                    className={cx(
                      'group relative w-full aspect-square rounded-[10px] flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-shadow',
                      view === 'buttons' ? 'bg-transparent' : tileBg,
                      on ? 'shadow-[0_0_0_2px_var(--color-accent)]' : view === 'buttons' ? 'hover:shadow-[0_0_0_1px_rgb(0_0_0/0.2)]' : 'shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_var(--color-line-strong)]',
                    )}
                  >
                    <span className="relative" style={{ width: size, height: size }}>
                      {!i.svg ? (
                        <Icon name="alert" size={size * 0.6} className="text-warning m-auto" />
                      ) : view === 'buttons' ? (
                        <>
                          <SvgView className="group-hover:opacity-0" svg={buttonState(iconAt(project, project.exportOptions, i.svg), 'false', opts)} />
                          <SvgView className="absolute inset-0 opacity-0 group-hover:opacity-100" svg={buttonState(iconAt(project, project.exportOptions, i.svg), 'true', opts)} />
                        </>
                      ) : (
                        <SvgView svg={size === 24 ? iconAt(project, project.exportOptions, i.svg, 24) : i.svg} />
                      )}
                    </span>
                    {size === 48 ? <span className={cx('text-[11px] truncate max-w-[90%]', view === 'dark' ? 'text-white/65' : 'text-[#5b616b]')}>{i.name}</span> : null}
                    {i.status === 'approved' ? (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-[5px] bg-success text-white flex items-center justify-center">
                        <Icon name="check" size={10} strokeWidth={3.2} />
                      </span>
                    ) : i.status === 'flagged' ? (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-warning" />
                    ) : null}
                    {checks[i.id] ? <span title={checks[i.id].map((c) => CHECK_TEXT[c]).join(' ')} className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-accent" /> : null}
                  </button>
                </li>
              );
            })}
            {waiting.map((n) => (
              <li key={`w-${n}`} aria-label={`${n}, not drawn yet`} className={cx('aspect-square rounded-[10px] flex flex-col items-center justify-center gap-1.5 text-[11px] text-ink-3 text-center px-1', running ? 'skeleton' : 'border border-dashed border-line-strong bg-card/60')}>
                <span className={cx('rounded-[6px]', running ? '' : 'bg-fill')} style={{ width: size * 0.6, height: size * 0.6 }} />
                {size === 48 ? <span className="truncate max-w-[90%]">{n}</span> : null}
              </li>
            ))}
            {icons.length ? (
              <li>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  disabled={busy === 'add'}
                  className="w-full aspect-square rounded-[10px] border border-dashed border-[#9aa0a8]/60 bg-transparent text-[#6b7280] hover:text-accent hover:border-accent flex flex-col items-center justify-center gap-1 cursor-pointer text-[11px] font-medium disabled:opacity-50"
                >
                  {busy === 'add' ? <Spinner size={18} /> : <Icon name="plus" size={18} />}
                  {busy === 'add' ? 'Adding…' : 'Add icons'}
                </button>
              </li>
            ) : null}
          </ul>
          {icons.length ? (
            <div className="flex flex-wrap gap-2 px-4 py-2.5 border-t border-line">
              <Button size="sm" icon="check" onClick={() => update((p) => ({ ...p, icons: p.icons.map((i) => (i.svg ? { ...i, status: 'approved' } : i)) }))}>
                Approve all
              </Button>
              <Button size="sm" variant="ghost" icon="refresh" busy={busy === 'retrace'} onClick={retrace}>
                Re-trace with current colors
              </Button>
            </div>
          ) : null}
        </Card>

        {selected ? (
          <Inspector key={selected.id} icon={selected} project={project} each={each} setStatus={setStatus} notes={checks[selected.id] ?? []} />
        ) : (
          <Card className="p-5 text-[13px] text-ink-2 grid-paper">
            <p className="font-medium text-ink mb-1">Nothing drawn yet</p>
            Press Generate icons. It takes 20 to 60 seconds per sheet, and each icon costs a fraction of a cent.
          </Card>
        )}
      </div>

      <ActionBar
        summary={
          <>
            <Stat value={icons.length} label="drawn" />
            <Stat value={approved} label="approved" />
            <Stat value={formatUsd(project.spent)} label="spent" />
          </>
        }
      >
        <Button variant="primary" size="lg" onClick={onNext} disabled={!icons.some((i) => i.svg)}>
          Continue to Export
          <Icon name="arrowRight" size={17} />
        </Button>
      </ActionBar>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Replace draft icons?">
        <p className="text-ink-2 mb-5">{drafts.length} icons that aren’t approved yet will be replaced by the new sheet. Approved icons are kept and used as style references.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="primary" onClick={run}>
            Generate
          </Button>
        </div>
      </Dialog>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add icons to the set">
        <p className="text-ink-2 mb-4">
          New icons are drawn on a fresh sheet{approved ? ' using your approved icons as style references' : ''}. About {formatUsd(each * project.candidates)}.
        </p>
        <TextField label="Icon names" value={newNames} onChange={setNewNames} placeholder="Flow meter, Heater, Alarm bell" onEnter={addIcons} autoFocus />
        <div className="flex justify-end gap-2 mt-5">
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="primary" icon="sparkles" onClick={addIcons} disabled={!newNames.trim()}>
            Draw icons
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function Progress({ stage, detail }: { stage: Stage; detail?: string }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <div aria-label="Progress" className="mt-3 pt-3 border-t border-line">
      <ol className="grid grid-cols-3 gap-1.5" aria-live="polite">
        {STAGES.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-1.5">
            <span className={cx('h-1 rounded-full', i < at ? 'bg-success' : i === at ? 'skeleton bg-accent-soft' : 'bg-fill')} />
            <span className={cx('flex items-center gap-1.5 text-[12px] font-medium', i < at ? 'text-success' : i === at ? 'text-ink' : 'text-ink-3')}>
              {i < at ? <Icon name="check" size={13} strokeWidth={2.6} /> : i === at ? <Spinner size={12} /> : null}
              <span className="truncate">{i === at && detail ? detail : s.label}</span>
            </span>
          </li>
        ))}
      </ol>
      {stage === 'image' ? <p className="text-[12px] text-ink-3 mt-2">Image models take 20–60 seconds per sheet.</p> : null}
    </div>
  );
}

/** One generated sheet: its picture, what it cost, and its alternative options. */
function SheetStrip({ run, onPick, switching }: { run: SheetRun; onPick: (i: number) => void; switching: boolean }) {
  const [open, setOpen] = useState(false);
  const cost = run.candidates.reduce((s, c) => s + c.cost, 0);
  const letter = (i: number) => String.fromCharCode(65 + i);
  return (
    <Card className="flex items-center gap-3 p-2 pr-3">
      <button type="button" onClick={() => setOpen(true)} aria-label="View sheet" className="relative w-11 h-11 rounded-[8px] overflow-hidden checker shrink-0 cursor-pointer shadow-[inset_0_0_0_1px_var(--color-line)]">
        <img src={run.candidates[run.chosen].dataUrl} alt={`Generated sheet, option ${letter(run.chosen)}`} className="w-full h-full object-contain" />
        {switching ? (
          <span className="absolute inset-0 bg-card/70 flex items-center justify-center">
            <Spinner size={16} />
          </span>
        ) : null}
      </button>
      <div className="flex-1 min-w-0 text-[13px]">
        <div className="font-medium truncate">
          Sheet of {run.names.length} · {getModel(run.modelId).label}
        </div>
        <div className="text-[12px] text-ink-3 font-mono tabular-nums">
          {run.cols}×{run.rows} · {formatUsd(cost)}
        </div>
      </div>
      {run.candidates.length > 1 ? (
        <Segmented size="sm" label="Option" value={run.chosen} onChange={onPick} options={run.candidates.map((_, i) => ({ value: i, label: `Option ${letter(i)}`, disabled: switching }))} />
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Sheet, option ${letter(run.chosen)}`} wide>
        <div className="checker rounded-[10px] aspect-square overflow-hidden">
          <img src={run.candidates[run.chosen].dataUrl} alt="" className="w-full h-full object-contain" />
        </div>
      </Dialog>
    </Card>
  );
}

function Inspector({ icon, project, each, setStatus, notes }: { icon: IconItem; project: Project; each: number; setStatus: (id: string, s: IconItem['status']) => void; notes: CheckId[] }) {
  const { update, deps, notify } = useStore();
  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState<'svg' | 'png'>('svg');
  const [busy, setBusy] = useState<'edit' | 'vary' | null>(null);
  const [options, setOptions] = useState<ProcessedCell[] | null>(null);
  const [name, setName] = useState(icon.name);
  const o = project.exportOptions;

  const edit = async () => {
    const d = deps();
    if (!d || !instruction.trim()) return;
    setBusy('edit');
    try {
      const cell = await editIcon(d, project, icon, instruction);
      update((p) => replaceIcon(p, icon.id, cell, instruction));
      setInstruction('');
      notify(cell.flags.length ? 'Edited. The result needs a look.' : 'Edited.', cell.flags.length ? 'info' : 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const vary = async () => {
    const d = deps();
    if (!d) return;
    setBusy('vary');
    try {
      setOptions((await iconVariations(d, project, icon)).filter((c) => c.svg));
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const rename = () => {
    const n = name.trim();
    if (!n) return setName(icon.name);
    if (n === icon.name) return;
    // Keep the set's name list in step, or Draw would redraw the old name as a new icon.
    update((p) => ({
      ...p,
      icons: p.icons.map((i) => (i.id === icon.id ? { ...i, name: n } : i)),
      iconNames: p.iconNames.some((x) => x.toLowerCase() === n.toLowerCase()) ? p.iconNames.filter((x) => x !== icon.name) : p.iconNames.map((x) => (x === icon.name ? n : x)),
    }));
  };

  const at = (px: number) => iconAt(project, o, icon.svg!, px);
  const bOpts = buttonOptions(project, o);

  return (
    <Card as="aside" aria-label="Selected icon" className="lg:sticky lg:top-[72px] overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <input
          aria-label="Icon name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="flex-1 min-w-0 bg-transparent text-[16px] font-semibold outline-none rounded-[6px] focus:bg-fill px-1.5 -mx-1.5 h-8"
        />
        <Badge tone={icon.status === 'approved' ? 'success' : icon.status === 'flagged' ? 'warning' : 'neutral'}>{icon.status === 'approved' ? 'Approved' : icon.status === 'flagged' ? 'Check' : 'Draft'}</Badge>
      </div>

      <div className="mx-4 rounded-[10px] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-line)]">
        <div className="checker aspect-[16/10] flex items-center justify-center gap-7 relative">
          <span className="w-28 h-28">{mode === 'svg' && icon.svg ? <SvgView svg={icon.svg} label={icon.name} /> : icon.png ? <img src={icon.png} alt={icon.name} className="w-full h-full object-contain" /> : null}</span>
          {icon.svg && mode === 'svg' ? (
            <span className="flex flex-col items-center gap-2.5">
              {[32, 24, 16].map((px) => (
                <span key={px} style={{ width: px, height: px }}>
                  <SvgView svg={at(px)} />
                </span>
              ))}
            </span>
          ) : null}
          <span className="absolute bottom-2 left-2">
            <Segmented size="sm" label="Preview" value={mode} onChange={setMode} options={[{ value: 'svg', label: 'Traced SVG' }, { value: 'png', label: 'Original' }]} />
          </span>
          <span className="absolute bottom-3 right-3 text-[11px] text-[#858c97] font-mono">{icon.svg ? `${(icon.svg.length / 1024).toFixed(1)} KB` : ''}</span>
        </div>
        {icon.svg ? (
          <div aria-label="In LabVIEW" className="panel-face flex items-center justify-between gap-2 px-3 py-2.5 border-t border-[#c9cbcf]">
            {(['false', 'true'] as const).map((st) => (
              <span key={st} className="flex flex-col items-center gap-0.5 text-[10px] text-[#55585e]">
                <span className="w-10 h-10">
                  <SvgView svg={buttonState(at(48), st, { ...bOpts, shape: 'square' })} label={`${icon.name} button, ${st}`} />
                </span>
                {st === 'false' ? 'False' : 'True'}
              </span>
            ))}
            <span className="flex flex-col items-center gap-0.5 text-[10px] text-[#55585e]">
              <span className="w-10 h-10 p-1">
                <SvgView svg={viIcon(at(20), { banner: o.bannerText, bannerColor: o.bannerColor || undefined, pixel: project.style.style === 'pixel' })} label={`${icon.name} VI icon`} />
              </span>
              VI icon
            </span>
            {(['on', 'alarm'] as const).map((st) => (
              <span key={st} className="flex flex-col items-center gap-0.5 text-[10px] text-[#55585e]">
                <span className="w-10 h-10 p-1">
                  <SvgView svg={statusVariant(at(48), st, { onColor: o.stateColor || undefined })} />
                </span>
                {st === 'on' ? 'On' : 'Alarm'}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {icon.flags.length ? (
          <ul className="rounded-[8px] bg-warning-soft px-3 py-2 text-[12px] flex flex-col gap-1">
            {icon.flags.map((f) => (
              <li key={f} className="flex gap-2">
                <Icon name="alert" size={14} className="text-warning shrink-0 mt-px" />
                {FLAG_TEXT[f] ?? f}
              </li>
            ))}
          </ul>
        ) : null}

        {notes.length ? (
          <section aria-label="Set checks" className="rounded-[8px] bg-accent-soft px-3 py-2 text-[12px] flex flex-col gap-1.5">
            {notes.map((c) => (
              <div key={c} className="flex gap-2 items-start">
                <Icon name="info" size={14} className="text-accent shrink-0 mt-px" />
                <span className="flex-1">
                  {CHECK_TEXT[c]}
                  {CHECK_FIX[c] ? (
                    <>
                      {' '}
                      <button type="button" className="text-accent font-medium cursor-pointer hover:underline" onClick={() => setInstruction(CHECK_FIX[c]!)}>
                        Suggest a fix
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
          <TextField label="Change it with a sentence" multiline rows={2} value={instruction} onChange={setInstruction} placeholder="Make the impeller bigger and the pipe shorter" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" icon="wand" busy={busy === 'edit'} disabled={!instruction.trim() || !!busy} onClick={edit}>
              Apply
            </Button>
            <Button icon="layers" busy={busy === 'vary'} disabled={!!busy} onClick={vary}>
              4 options
            </Button>
          </div>
          <p className="text-[11px] text-ink-3">About {formatUsd(each)} each. Approved icons are used as references.</p>
        </div>

        {options ? (
          <div className="flex flex-col gap-2 animate-fade">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink-2">Pick one to replace it</span>
              <Button size="sm" variant="ghost" onClick={() => setOptions(null)}>
                Dismiss
              </Button>
            </div>
            <ul className="grid grid-cols-4 gap-2">
              {options.map((opt, k) => (
                <li key={k}>
                  <button
                    type="button"
                    aria-label={`Use option ${k + 1}`}
                    onClick={() => {
                      update((p) => replaceIcon(p, icon.id, opt, 'variation'));
                      setOptions(null);
                    }}
                    className="w-full aspect-square p-2 rounded-[8px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_2px_var(--color-accent)] cursor-pointer"
                  >
                    <SvgView svg={opt.svg} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {icon.history.length ? (
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
              <Icon name="history" size={14} /> Earlier versions ({icon.history.length})
            </summary>
            <ul className="grid grid-cols-5 gap-2 mt-2">
              {icon.history.map((h) => (
                <li key={h.at}>
                  <button
                    type="button"
                    title={`Restore (before: ${h.note})`}
                    aria-label={`Restore version from before “${h.note}”`}
                    onClick={() =>
                      update((p) => ({
                        ...p,
                        icons: p.icons.map((i) => (i.id === icon.id ? { ...i, svg: h.svg, png: h.png, flags: [], history: [{ svg: i.svg!, png: i.png!, note: 'restore', at: Date.now() }, ...i.history.filter((x) => x.at !== h.at)] } : i)),
                      }))
                    }
                    className="w-full aspect-square p-1.5 rounded-[8px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_2px_var(--color-accent)] cursor-pointer"
                  >
                    <SvgView svg={h.svg} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t border-line bg-raised">
        {icon.status === 'approved' ? (
          <Button className="flex-1" onClick={() => setStatus(icon.id, 'draft')}>
            Unapprove
          </Button>
        ) : (
          <Button className="flex-1" variant="primary" icon="check" disabled={!icon.svg} onClick={() => setStatus(icon.id, 'approved')}>
            Approve
          </Button>
        )}
        <Button icon="download" aria-label="Download SVG" title="Download SVG" disabled={!icon.svg} onClick={() => download(`${fileName(icon.name, 'kebab')}.svg`, icon.svg!, 'image/svg+xml')} />
        <Button
          variant="danger"
          icon="trash"
          aria-label="Delete icon"
          title="Delete icon"
          onClick={() => update((p) => ({ ...p, icons: p.icons.filter((i) => i.id !== icon.id), iconNames: p.iconNames.filter((n) => n !== icon.name) }))}
        />
      </div>
    </Card>
  );
}
