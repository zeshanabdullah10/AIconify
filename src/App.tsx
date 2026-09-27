import { useEffect, useState } from 'react';
import { ConnectDialog } from './components/ConnectDialog';
import { Icon } from './components/icons';
import { Button, cx, Dialog } from './components/ui';
import { exchangeCode } from './lib/openrouter';
import { formatUsd } from './lib/models';
import { DrawStep } from './steps/DrawStep';
import { ExportStep } from './steps/ExportStep';
import { SetupStep } from './steps/SetupStep';
import { errorText, useStore } from './store';

export const STEPS = [
  { id: 'setup', label: 'Set up' },
  { id: 'draw', label: 'Draw' },
  { id: 'export', label: 'Export' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

/** Links from the five-step version still land on the right screen. */
const OLD: Record<string, StepId> = { brand: 'setup', style: 'setup', generate: 'draw', review: 'draw' };

function stepFromHash(): StepId {
  const h = window.location.hash.replace('#', '');
  return (STEPS.find((s) => s.id === h)?.id ?? OLD[h] ?? 'setup') as StepId;
}

/** The mark: a tiny VI icon, with a frame, a banner and a glyph. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#15181d" />
      <rect x="6" y="6" width="20" height="20" rx="2" fill="#ffffff" />
      <rect x="6" y="6" width="20" height="6" rx="2" fill="#2f9e44" />
      <rect x="6" y="10" width="20" height="2" fill="#2f9e44" />
      <path d="M11 16.5h4.5a3 3 0 0 1 0 6H11z" fill="none" stroke="#15181d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18.5 19.5h3" stroke="#e8590c" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const store = useStore();
  const { project, update, apiKey, setApiKey, notify, setConnectOpen } = store;
  const [step, setStep] = useState<StepId>(stepFromHash);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setStep(stepFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Finish the "Connect OpenRouter" redirect.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return;
    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.toString());
    exchangeCode(code)
      .then((key) => {
        setApiKey(key);
        notify('OpenRouter connected.', 'success');
      })
      .catch((e) => notify(errorText(e), 'error'));
  }, [setApiKey, notify]);

  const go = (id: StepId) => {
    window.location.hash = id;
    setStep(id);
    window.scrollTo({ top: 0 });
  };

  // What each step has produced, shown under its name.
  const drawn = project.icons.filter((i) => i.svg).length;
  const approved = project.icons.filter((i) => i.status === 'approved').length;
  const status: Record<StepId, { done: boolean; note: string }> = {
    setup: { done: project.iconNames.length > 0, note: project.iconNames.length ? `${project.iconNames.length} icons` : 'Pick icons' },
    draw: { done: drawn > 0 && approved === drawn, note: drawn ? `${approved}/${drawn} approved` : 'Not drawn' },
    export: { done: false, note: project.exportOptions.targets.includes('labview') ? 'LabVIEW' : `${project.exportOptions.targets.length} targets` },
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-xl border-b border-line">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-5 h-14 flex items-center gap-3">
          <a href="#setup" onClick={() => go('setup')} className="flex items-center gap-2 shrink-0" aria-label="AIconify">
            <Mark />
            <span className="hidden lg:inline font-semibold text-[15px] tracking-[-0.01em]">AIconify</span>
          </a>
          <span aria-hidden="true" className="hidden lg:block w-px h-5 bg-line-strong" />
          <label className="hidden md:block min-w-0 w-[180px]">
            <span className="sr-only">Set name</span>
            <input
              value={project.brand.name}
              onChange={(e) => update((p) => ({ ...p, brand: { ...p.brand, name: e.target.value } }))}
              placeholder="Untitled icon set"
              className="w-full h-8 px-2 rounded-[6px] bg-transparent text-[14px] font-medium outline-none hover:bg-fill focus:bg-fill placeholder:text-ink-3 truncate"
            />
          </label>

          <nav aria-label="Steps" className="flex-1 flex justify-center min-w-0">
            <ol className="flex items-center">
              {STEPS.map((s, i) => {
                const here = s.id === step;
                const st = status[s.id];
                return (
                  <li key={s.id} className="flex items-center">
                    {i ? <span aria-hidden="true" className={cx('w-4 sm:w-8 h-[2px] rounded-full', status[STEPS[i - 1].id].done ? 'bg-wire-bool' : 'bg-line-strong')} /> : null}
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        go(s.id);
                      }}
                      aria-current={here ? 'step' : undefined}
                      className={cx('flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-[10px] transition-colors', here ? 'bg-fill' : 'hover:bg-fill')}
                    >
                      <span
                        className={cx(
                          'w-6 h-6 rounded-[7px] flex items-center justify-center text-[12px] font-semibold tabular-nums shrink-0',
                          here ? 'bg-accent text-white' : st.done ? 'bg-success-soft text-success' : 'bg-card text-ink-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                        )}
                      >
                        {st.done && !here ? <Icon name="check" size={13} strokeWidth={2.6} /> : i + 1}
                      </span>
                      <span className="flex flex-col leading-tight">
                        <span className={cx('text-[13px] font-semibold', here ? 'text-ink' : 'text-ink-2')}>{s.label}</span>
                        <span className="hidden sm:block text-[11px] text-ink-3">{st.note}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <span title="What this project has cost so far on OpenRouter" className="hidden sm:inline-flex h-8 items-center px-2.5 rounded-[8px] bg-fill text-[12px] font-mono tabular-nums text-ink-2">
              {formatUsd(project.spent)}
            </span>
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              aria-label={apiKey ? 'OpenRouter settings' : 'Connect OpenRouter'}
              className={cx(
                'h-8 rounded-[8px] flex items-center gap-1.5 text-[13px] font-medium cursor-pointer transition-colors',
                apiKey ? 'w-8 justify-center hover:bg-fill text-ink-2' : 'px-3 bg-accent text-white hover:bg-accent-hover',
              )}
            >
              <Icon name={apiKey ? 'gear' : 'key'} size={16} />
              {apiKey ? null : <span>Connect</span>}
            </button>
          </div>
        </div>
      </header>

      <main key={step} className="flex-1 w-full max-w-[1480px] mx-auto px-3 sm:px-5 pt-5 pb-28 animate-rise">
        {step === 'setup' && <SetupStep onNext={() => go('draw')} />}
        {step === 'draw' && <DrawStep onNext={() => go('export')} onBack={() => go('setup')} />}
        {step === 'export' && <ExportStep onBack={() => go('draw')} />}
      </main>

      <footer className="border-t border-line">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-5 py-5 pb-24 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-ink-3">
          <span>Open source · MIT. Your key and files stay in this browser.</span>
          <a className="hover:text-ink-2" href="https://github.com/zeshanabdullah10/AIconify" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button type="button" className="hover:text-ink-2 cursor-pointer" onClick={() => setResetOpen(true)}>
            New project
          </button>
        </div>
      </footer>

      <ConnectDialog />
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="Start a new project?">
        <p className="text-ink-2 mb-5">This clears the icons, brand kit and history in this browser. Your OpenRouter connection stays.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              store.reset();
              setResetOpen(false);
              go('setup');
            }}
          >
            Clear project
          </Button>
        </div>
      </Dialog>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div aria-live="polite" className="fixed z-50 bottom-20 sm:bottom-auto sm:top-16 right-3 sm:right-5 flex flex-col items-end gap-2 w-[calc(100%-24px)] max-w-[380px] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto animate-rise flex items-start gap-2.5 w-full px-3.5 py-2.5 rounded-[10px] bg-card shadow-(--shadow-float) text-[13px] border border-line"
        >
          <span className={cx('mt-px', t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : 'text-accent')}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} size={16} strokeWidth={2.2} />
          </span>
          <span className="flex-1">{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink cursor-pointer">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
