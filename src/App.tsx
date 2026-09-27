import { useEffect, useState } from 'react';
import { ConnectDialog } from './components/ConnectDialog';
import { Icon } from './components/icons';
import { Button, cx, Dialog } from './components/ui';
import { exchangeCode } from './lib/openrouter';
import { formatUsd } from './lib/models';
import { BrandStep } from './steps/BrandStep';
import { ExportStep } from './steps/ExportStep';
import { GenerateStep } from './steps/GenerateStep';
import { ReviewStep } from './steps/ReviewStep';
import { StyleStep } from './steps/StyleStep';
import { errorText, useStore } from './store';

export const STEPS = [
  { id: 'brand', label: 'Brand' },
  { id: 'style', label: 'Style' },
  { id: 'generate', label: 'Generate' },
  { id: 'review', label: 'Review' },
  { id: 'export', label: 'Export' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

function stepFromHash(): StepId {
  const h = window.location.hash.replace('#', '');
  return (STEPS.find((s) => s.id === h)?.id ?? 'brand') as StepId;
}

export default function App() {
  const store = useStore();
  const { project, apiKey, setApiKey, notify, setConnectOpen } = store;
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const idx = STEPS.findIndex((s) => s.id === step);
  const next = () => idx < STEPS.length - 1 && go(STEPS[idx + 1].id);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150 border-b border-line">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <a href="#brand" onClick={() => go('brand')} className="flex items-center gap-2 font-semibold tracking-[-0.02em] text-[17px] shrink-0">
            <span aria-hidden="true" className="grid grid-cols-2 gap-[2px] w-6 h-6 p-[4px] rounded-[7px] bg-ink">
              <span className="rounded-[2px] bg-canvas" />
              <span className="rounded-[2px] bg-accent" />
              <span className="rounded-[2px] bg-accent" />
              <span className="rounded-[2px] bg-canvas" />
            </span>
            <span className="hidden sm:inline">AIconify</span>
          </a>
          <nav aria-label="Steps" className="flex-1 flex justify-center min-w-0">
            <ol className="flex items-center gap-0.5 p-0.5 rounded-full bg-fill overflow-x-auto max-w-full">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      go(s.id);
                    }}
                    aria-current={s.id === step ? 'step' : undefined}
                    className={cx(
                      'flex items-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-full text-[13px] font-medium transition-all whitespace-nowrap',
                      s.id === step ? 'bg-card text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    <span className={cx('text-[11px] tabular-nums', s.id === step ? 'text-accent' : 'text-ink-3')}>{i + 1}</span>
                    <span className={cx(s.id !== step && 'hidden md:inline')}>{s.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <span title="What this project has cost so far on OpenRouter" className="hidden sm:inline-flex h-8 items-center px-3 rounded-full bg-fill text-[13px] font-mono tabular-nums text-ink-2">
              {formatUsd(project.spent)}
            </span>
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              aria-label={apiKey ? 'OpenRouter settings' : 'Connect OpenRouter'}
              className={cx(
                'h-8 rounded-full flex items-center gap-1.5 text-[13px] font-medium cursor-pointer transition-colors',
                apiKey ? 'w-8 justify-center bg-fill hover:bg-fill-2 text-ink-2' : 'px-3.5 bg-accent text-white hover:bg-accent-hover',
              )}
            >
              <Icon name={apiKey ? 'gear' : 'key'} size={16} />
              {apiKey ? null : <span>Connect</span>}
            </button>
          </div>
        </div>
      </header>

      <main key={step} className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-28 animate-rise">
        {step === 'brand' && <BrandStep onNext={next} />}
        {step === 'style' && <StyleStep onNext={next} />}
        {step === 'generate' && <GenerateStep onNext={next} />}
        {step === 'review' && <ReviewStep onNext={next} />}
        {step === 'export' && <ExportStep onReset={() => setResetOpen(true)} />}
      </main>

      <footer className="border-t border-line">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-ink-3">
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
        <p className="text-ink-2 mb-6">This clears the brand kit, icons and history in this browser. Your OpenRouter connection stays.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              store.reset();
              setResetOpen(false);
              go('brand');
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
    <div aria-live="polite" className="fixed z-50 bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[calc(100%-32px)] max-w-[440px] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto animate-rise flex items-start gap-3 w-full px-4 py-3 rounded-[16px] bg-card/90 backdrop-blur-xl shadow-(--shadow-float) text-[14px]"
        >
          <span className={cx('mt-0.5', t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : 'text-accent')}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'sparkles'} size={17} />
          </span>
          <span className="flex-1">{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink cursor-pointer">
            <Icon name="x" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
