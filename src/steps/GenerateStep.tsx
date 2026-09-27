import { useMemo, useRef, useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Icon } from '../components/icons';
import { Badge, Button, Card, CardHeader, Dialog, Segmented, Spinner, SvgView, cx } from '../components/ui';
import { estimateSheets, formatUsd, getModel, IMAGE_MODELS } from '../lib/models';
import { generateIcons, MAX_PER_SHEET, applyCandidate } from '../lib/pipeline';
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

export function GenerateStep({ onNext }: { onNext: () => void }) {
  const { project, update, deps, codec, notify } = useStore();
  const [stage, setStage] = useState<Stage | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const model = getModel(project.modelId);
  const names = pendingNames(project);
  const sheets = Math.ceil(names.length / MAX_PER_SHEET);
  const estimate = estimateSheets(project.modelId, project.quality, sheets, project.candidates) + 0.0005;
  const drafts = project.icons.filter((i) => i.status !== 'approved' && names.some((n) => n.toLowerCase() === i.name.toLowerCase()));
  const latestRuns = useMemo(() => {
    const ids = new Set(project.icons.map((i) => i.runId));
    return project.runs.filter((r) => ids.has(r.id)).slice(-3);
  }, [project.icons, project.runs]);

  const run = async () => {
    setConfirm(false);
    const d = deps();
    if (!d) return;
    abort.current = new AbortController();
    try {
      const res = await generateIcons(
        { ...d, signal: abort.current.signal, onStage: (s, det) => (setStage(s), setDetail(det)) },
        project,
        names,
      );
      update((p) => ({ ...p, runs: [...p.runs, ...res.runs].slice(-12), icons: mergeIcons(p.icons, res.icons) }));
      setStage('done');
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

  const busy = stage !== null && stage !== 'done';
  const recent = latestRuns.length > 0;

  return (
    <>
      <StepHeader
        eyebrow="Step 3 of 5"
        title="Draw the whole set at once."
        subtitle="One image holds up to 16 icons, so they share a style and cost a fraction of a cent each. We cut it apart, trace it to SVG and tidy it up."
        action={
          recent ? (
            <Button variant="primary" icon="arrowRight" onClick={onNext}>
              Review icons
            </Button>
          ) : null
        }
      />
      <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
        <Card className="p-5 sm:p-6 flex flex-col gap-5">
          <CardHeader title="Model" detail="Prices are per sheet, from OpenRouter." />
          <div role="radiogroup" aria-label="Image model" className="flex flex-col gap-2 -mt-2">
            {IMAGE_MODELS.map((m) => {
              const on = m.id === project.modelId;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => update((p) => ({ ...p, modelId: m.id, candidates: Math.min(p.candidates, m.maxN === 1 ? 2 : p.candidates) }))}
                  className={cx(
                    'flex items-center gap-3 p-3.5 rounded-[16px] text-left transition-all cursor-pointer',
                    on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'bg-raised shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                  )}
                >
                  <span className={cx('w-5 h-5 rounded-full shrink-0 transition-all', on ? 'border-[6px] border-accent' : 'border-2 border-line-strong')} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold">{m.label}</span>
                    <span className="block text-[12px] text-ink-2 leading-snug">{m.blurb}</span>
                  </span>
                  <span className="text-[13px] font-mono tabular-nums text-ink-2">~{formatUsd(m.estimate[m.quality ? project.quality : 'low'])}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-3">
            {model.quality ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-ink-2">Quality</span>
                <Segmented label="Quality" value={project.quality} onChange={(v) => update((p) => ({ ...p, quality: v }))} options={[{ value: 'low', label: 'Draft' }, { value: 'medium', label: 'Standard' }]} />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] text-ink-2">Options per sheet</span>
              <Segmented label="Options per sheet" value={project.candidates} onChange={(v) => update((p) => ({ ...p, candidates: v }))} options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))} />
            </div>
          </div>
          <div className="pt-4 border-t border-line flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] text-ink-2">
                {names.length} icons · {sheets} {sheets === 1 ? 'sheet' : 'sheets'} × {project.candidates}
              </span>
              <span className="font-mono tabular-nums text-[17px]">~{formatUsd(estimate)}</span>
            </div>
            {busy ? (
              <Button size="lg" onClick={() => abort.current?.abort()}>
                <Spinner /> Cancel
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                icon="sparkles"
                disabled={names.length === 0}
                onClick={() => (drafts.length ? setConfirm(true) : run())}
              >
                {names.length === 0 ? 'All icons approved' : recent ? 'Generate again' : 'Generate icons'}
              </Button>
            )}
            {project.iconNames.length === 0 ? <p className="text-[13px] text-ink-2">Add icon names in the Style step first.</p> : null}
          </div>
        </Card>

        <div className="flex flex-col gap-5 min-w-0">
          {stage && stage !== 'done' ? <Progress stage={stage} detail={detail} /> : null}
          {recent ? (
            latestRuns.map((r) => <RunCard key={r.id} run={r} project={project} onPick={(i) => pickCandidate(r, i)} switching={switching === r.id} />)
          ) : !busy ? (
            <Card className="p-10 flex flex-col items-center text-center gap-3 min-h-[360px] justify-center">
              <span className="w-14 h-14 rounded-[16px] bg-fill flex items-center justify-center text-ink-2">
                <Icon name="grid" size={26} />
              </span>
              <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Your sheet will appear here</h2>
              <p className="text-ink-2 max-w-[380px]">Pick a model and generate. GPT Image 2.5 Flare gives real transparency and is the best all-rounder.</p>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Replace draft icons?">
        <p className="text-ink-2 mb-6">
          {drafts.length} icons that aren’t approved yet will be replaced by the new sheet. Approved icons are kept and used as style references.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="primary" onClick={run}>
            Generate
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function Progress({ stage, detail }: { stage: Stage; detail?: string }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <Card className="p-5" aria-label="Progress">
      <ol className="grid grid-cols-3 gap-2" aria-live="polite">
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            className={cx(
              'flex items-center gap-2 h-11 px-3.5 rounded-[12px] text-[13px] font-medium transition-colors',
              i < at && 'bg-success-soft text-success',
              i === at && 'bg-accent-soft text-accent',
              i > at && 'bg-fill text-ink-3',
            )}
          >
            {i < at ? <Icon name="check" size={15} strokeWidth={2.4} /> : i === at ? <Spinner size={14} /> : <span className="w-3.5" />}
            <span className="truncate">{i === at && detail ? detail : s.label}</span>
          </li>
        ))}
      </ol>
      {stage === 'image' ? <p className="text-[13px] text-ink-2 mt-3">Image models take 20–60 seconds per sheet.</p> : null}
    </Card>
  );
}

function RunCard({ run, project, onPick, switching }: { run: SheetRun; project: Project; onPick: (i: number) => void; switching: boolean }) {
  const icons = project.icons.filter((i) => i.runId === run.id).sort((a, b) => (a.cell ?? 0) - (b.cell ?? 0));
  const flagged = icons.filter((i) => i.flags.length);
  const cost = run.candidates.reduce((s, c) => s + c.cost, 0);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title={`${run.names.length} icons · ${getModel(run.modelId).label}`}
        detail={`${run.cols}×${run.rows} grid · ${formatUsd(cost)}`}
        action={
          run.candidates.length > 1 ? (
            <Segmented
              size="sm"
              label="Option"
              value={run.chosen}
              onChange={onPick}
              options={run.candidates.map((_, i) => ({ value: i, label: `Option ${String.fromCharCode(65 + i)}`, disabled: switching }))}
            />
          ) : null
        }
      />
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <div className="checker rounded-[16px] aspect-square overflow-hidden relative">
          <img src={run.candidates[run.chosen].dataUrl} alt={`Generated sheet, option ${String.fromCharCode(65 + run.chosen)}`} className="w-full h-full object-contain" />
          {switching ? (
            <div className="absolute inset-0 bg-card/60 backdrop-blur-sm flex items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <ul className="grid grid-cols-4 gap-2">
            {icons.map((i) => (
              <li key={i.id} title={i.name} className={cx('relative aspect-square rounded-[12px] p-2.5 bg-paper shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]', i.flags.length > 0 && 'shadow-[inset_0_0_0_1.5px_var(--color-warning)]')}>
                {i.svg ? <SvgView svg={i.svg} label={i.name} /> : <span className="sr-only">{i.name} missing</span>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">
              <Icon name="check" size={13} strokeWidth={2.4} /> {icons.length - flagged.length} clean
            </Badge>
            {flagged.length ? (
              <Badge tone="warning">
                <Icon name="alert" size={13} /> {flagged.length} to check
              </Badge>
            ) : null}
          </div>
          {flagged.length ? (
            <ul className="text-[13px] text-ink-2 flex flex-col gap-1">
              {flagged.slice(0, 4).map((i) => (
                <li key={i.id}>
                  <span className="font-medium text-ink">{i.name}:</span> {FLAG_TEXT[i.flags[0]] ?? i.flags[0]}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
