import { useEffect, useMemo, useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Badge, Button, Card, CardHeader, Dialog, Segmented, SvgView, TextField, cx } from '../components/ui';
import { formatUsd, getModel } from '../lib/models';
import { editIcon, generateIcons, iconVariations, retraceAll, type ProcessedCell } from '../lib/pipeline';
import { CHECK_FIX, CHECK_TEXT, checkSet, type CheckId } from '../lib/quality';
import { fileName } from '../lib/svg';
import type { IconItem, Project } from '../lib/types';
import { errorText, useStore } from '../store';
import { FLAG_TEXT, mergeIcons } from './GenerateStep';

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

export function ReviewStep({ onNext }: { onNext: () => void }) {
  const { project, update, deps, codec, notify } = useStore();
  const icons = project.icons;
  const [sel, setSel] = useState<string | null>(icons[0]?.id ?? null);
  const [view, setView] = useState<'light' | 'dark'>('light');
  const [size, setSize] = useState<24 | 48>(48);
  const [adding, setAdding] = useState(false);
  const [newNames, setNewNames] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const selected = icons.find((i) => i.id === sel) ?? icons[0];
  const approved = icons.filter((i) => i.status === 'approved').length;
  const checks = useMemo(() => checkSet(icons, project.style), [icons, project.style]);
  const noted = Object.keys(checks).length;
  const model = getModel(project.modelId);
  const each = model.estimate[model.quality ? project.quality : 'low'];

  useEffect(() => {
    if (!icons.find((i) => i.id === sel) && icons[0]) setSel(icons[0].id);
  }, [icons, sel]);

  const setStatus = (id: string, status: IconItem['status']) => update((p) => ({ ...p, icons: p.icons.map((i) => (i.id === id ? { ...i, status } : i)) }));

  const addIcons = async () => {
    const names = newNames.split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const d = deps();
    if (!d) return;
    setAdding(false);
    setBusy('add');
    try {
      const res = await generateIcons(d, project, names);
      update((p) => ({
        ...p,
        iconNames: [...p.iconNames, ...names.filter((n) => !p.iconNames.includes(n))],
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

  if (icons.length === 0) {
    return (
      <>
        <StepHeader eyebrow="Step 4 of 5" title="Review and refine." subtitle="Generate a sheet first, then approve, edit or redo each icon here." />
        <Card className="p-10 text-center text-ink-2">No icons yet.</Card>
      </>
    );
  }

  return (
    <>
      <StepHeader
        eyebrow="Step 4 of 5"
        title="Review and refine."
        subtitle="Approve the icons you like. Edit the rest with a sentence. Approved icons become style references for every later edit."
        action={
          <Button variant="primary" icon="arrowRight" onClick={onNext}>
            Export
          </Button>
        }
      />
      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        <Card className="p-5 sm:p-6">
          <CardHeader
            title={project.brand.name ? `${project.brand.name} icons` : 'Your icons'}
            detail={`${icons.length} icons · ${approved} approved${noted ? ` · ${noted} with notes` : ''}`}
            action={
              <div className="flex gap-2 flex-wrap justify-end">
                <Segmented size="sm" label="Preview size" value={size} onChange={setSize} options={[{ value: 24, label: '24' }, { value: 48, label: '48' }]} />
                <Segmented size="sm" label="Background" value={view} onChange={setView} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
              </div>
            }
          />
          <ul className={cx('grid gap-2.5 p-2.5 -m-2.5 rounded-[18px]', size === 48 ? 'grid-cols-3 sm:grid-cols-5 xl:grid-cols-6' : 'grid-cols-4 sm:grid-cols-7 xl:grid-cols-8', view === 'dark' ? 'bg-[#1c1c1e]' : 'bg-paper-2')}>
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
                      'relative w-full aspect-square rounded-[16px] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all',
                      view === 'dark' ? 'bg-white/5 text-white' : 'bg-paper',
                      on ? 'shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                    )}
                  >
                    <span style={{ width: size, height: size }}>
                      {i.svg ? <SvgView svg={i.svg} /> : <Icon name="alert" size={size * 0.6} className="text-warning m-auto" />}
                    </span>
                    {size === 48 ? <span className={cx('text-[12px] truncate max-w-[90%]', view === 'dark' ? 'text-white/70' : 'text-[#6e6e73]')}>{i.name}</span> : null}
                    {i.status === 'approved' ? (
                      <span className="absolute top-2 right-2 w-[18px] h-[18px] rounded-full bg-success text-white flex items-center justify-center">
                        <Icon name="check" size={11} strokeWidth={3} />
                      </span>
                    ) : i.status === 'flagged' ? (
                      <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-warning" />
                    ) : null}
                    {checks[i.id] ? <span title={checks[i.id].map((c) => CHECK_TEXT[c]).join(' ')} className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-accent/70" /> : null}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={busy === 'add'}
                className="w-full aspect-square rounded-[16px] border-[1.5px] border-dashed border-line-strong text-ink-2 hover:text-accent hover:border-accent flex flex-col items-center justify-center gap-1.5 cursor-pointer text-[12px] font-medium disabled:opacity-50"
              >
                <Icon name="plus" size={20} />
                {busy === 'add' ? 'Adding…' : 'Add icons'}
              </button>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-line">
            <Button size="sm" icon="check" onClick={() => update((p) => ({ ...p, icons: p.icons.map((i) => (i.svg ? { ...i, status: 'approved' } : i)) }))}>
              Approve all
            </Button>
            <Button size="sm" icon="refresh" busy={busy === 'retrace'} onClick={retrace}>
              Re-trace with current colors
            </Button>
          </div>
        </Card>

        {selected ? <Inspector key={selected.id} icon={selected} project={project} each={each} setStatus={setStatus} download={download} notes={checks[selected.id] ?? []} /> : null}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add icons to the set">
        <p className="text-ink-2 mb-4">
          New icons are drawn on a fresh sheet{approved ? ' using your approved icons as style references' : ''}. About {formatUsd(each * project.candidates)}.
        </p>
        <TextField label="Icon names" value={newNames} onChange={setNewNames} placeholder="Wifi, Parking, Pet friendly" onEnter={addIcons} autoFocus />
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

function Inspector({
  icon,
  project,
  each,
  setStatus,
  download,
  notes,
}: {
  icon: IconItem;
  project: Project;
  each: number;
  setStatus: (id: string, s: IconItem['status']) => void;
  download: (name: string, text: string, type: string) => void;
  notes: CheckId[];
}) {
  const { update, deps, notify } = useStore();
  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState<'svg' | 'png'>('svg');
  const [busy, setBusy] = useState<'edit' | 'vary' | null>(null);
  const [options, setOptions] = useState<ProcessedCell[] | null>(null);
  const [name, setName] = useState(icon.name);

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
    // Keep the set's name list in step, or Generate would redraw the old name as a new icon.
    update((p) => ({
      ...p,
      icons: p.icons.map((i) => (i.id === icon.id ? { ...i, name: n } : i)),
      iconNames: p.iconNames.some((x) => x.toLowerCase() === n.toLowerCase())
        ? p.iconNames.filter((x) => x !== icon.name)
        : p.iconNames.map((x) => (x === icon.name ? n : x)),
    }));
  };

  return (
    <Card as="aside" aria-label="Selected icon" className="p-5 sm:p-6 flex flex-col gap-5 lg:sticky lg:top-20">
      <div className="flex items-center gap-2">
        <input
          aria-label="Icon name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="flex-1 min-w-0 bg-transparent text-[20px] font-semibold tracking-[-0.02em] outline-none rounded-md focus:bg-fill px-1 -mx-1"
        />
        <Badge tone={icon.status === 'approved' ? 'success' : icon.status === 'flagged' ? 'warning' : 'neutral'}>
          {icon.status === 'approved' ? 'Approved' : icon.status === 'flagged' ? 'Check' : 'Draft'}
        </Badge>
      </div>

      <div className="checker rounded-[18px] aspect-[4/3] flex items-center justify-center gap-8">
        <span className="w-32 h-32">
          {mode === 'svg' && icon.svg ? <SvgView svg={icon.svg} label={icon.name} /> : icon.png ? <img src={icon.png} alt={icon.name} className="w-full h-full object-contain" /> : null}
        </span>
        {icon.svg && mode === 'svg' ? (
          <span className="flex flex-col items-center gap-3">
            <span className="w-6 h-6"><SvgView svg={icon.svg} /></span>
            <span className="w-4 h-4"><SvgView svg={icon.svg} /></span>
          </span>
        ) : null}
      </div>
      <div className="-mt-2 flex items-center justify-between gap-3">
        <Segmented size="sm" label="Preview" value={mode} onChange={setMode} options={[{ value: 'svg', label: 'Traced SVG' }, { value: 'png', label: 'Original' }]} />
        <span className="text-[12px] text-ink-3 font-mono">{icon.svg ? `${(icon.svg.length / 1024).toFixed(1)} KB` : ''}</span>
      </div>

      {icon.flags.length ? (
        <ul className="rounded-[14px] bg-warning-soft px-4 py-3 text-[13px] flex flex-col gap-1">
          {icon.flags.map((f) => (
            <li key={f} className="flex gap-2">
              <Icon name="alert" size={15} className="text-warning shrink-0 mt-px" />
              {FLAG_TEXT[f] ?? f}
            </li>
          ))}
        </ul>
      ) : null}

      {notes.length ? (
        <section aria-label="Set checks" className="rounded-[14px] bg-accent-soft px-4 py-3 text-[13px] flex flex-col gap-2">
          {notes.map((c) => (
            <div key={c} className="flex gap-2 items-start">
              <Icon name="info" size={15} className="text-accent shrink-0 mt-px" />
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

      <div className="flex flex-col gap-2.5">
        <TextField label="Change it with a sentence" multiline rows={2} value={instruction} onChange={setInstruction} placeholder="Make the handle bigger and the steam wavier" />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" icon="wand" busy={busy === 'edit'} disabled={!instruction.trim() || !!busy} onClick={edit}>
            Apply
          </Button>
          <Button icon="layers" busy={busy === 'vary'} disabled={!!busy} onClick={vary}>
            4 options
          </Button>
        </div>
        <p className="text-[12px] text-ink-3">Each costs about {formatUsd(each)} and uses your approved icons as references.</p>
      </div>

      {options ? (
        <div className="flex flex-col gap-2 animate-fade">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Pick one to replace it</span>
            <Button size="sm" variant="plain" onClick={() => setOptions(null)}>
              Dismiss
            </Button>
          </div>
          <ul className="grid grid-cols-4 gap-2">
            {options.map((o, k) => (
              <li key={k}>
                <button
                  type="button"
                  aria-label={`Use option ${k + 1}`}
                  onClick={() => {
                    update((p) => replaceIcon(p, icon.id, o, 'variation'));
                    setOptions(null);
                  }}
                  className="w-full aspect-square p-2.5 rounded-[12px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_2px_var(--color-accent)] cursor-pointer"
                >
                  <SvgView svg={o.svg} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {icon.history.length ? (
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <Icon name="history" size={15} /> Earlier versions ({icon.history.length})
          </summary>
          <ul className="grid grid-cols-5 gap-2 mt-3">
            {icon.history.map((h) => (
              <li key={h.at}>
                <button
                  type="button"
                  title={`Restore (before: ${h.note})`}
                  aria-label={`Restore version from before “${h.note}”`}
                  onClick={() =>
                    update((p) => ({
                      ...p,
                      icons: p.icons.map((i) =>
                        i.id === icon.id ? { ...i, svg: h.svg, png: h.png, flags: [], history: [{ svg: i.svg!, png: i.png!, note: 'restore', at: Date.now() }, ...i.history.filter((x) => x.at !== h.at)] } : i,
                      ),
                    }))
                  }
                  className="w-full aspect-square p-2 rounded-[10px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_2px_var(--color-accent)] cursor-pointer"
                >
                  <SvgView svg={h.svg} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex gap-2 pt-4 border-t border-line">
        {icon.status === 'approved' ? (
          <Button className="flex-1" onClick={() => setStatus(icon.id, 'draft')}>
            Unapprove
          </Button>
        ) : (
          <Button className="flex-1" variant="primary" icon="check" disabled={!icon.svg} onClick={() => setStatus(icon.id, 'approved')}>
            Approve
          </Button>
        )}
        <Button icon="download" aria-label="Download SVG" disabled={!icon.svg} onClick={() => download(`${fileName(icon.name, 'kebab')}.svg`, icon.svg!, 'image/svg+xml')} />
        <Button
          variant="danger"
          icon="trash"
          aria-label="Delete icon"
          onClick={() => update((p) => ({ ...p, icons: p.icons.filter((i) => i.id !== icon.id), iconNames: p.iconNames.filter((n) => n !== icon.name) }))}
        />
      </div>
    </Card>
  );
}
