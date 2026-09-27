import type { ReactNode } from 'react';

/**
 * The bar pinned to the bottom of every step: what you have so far on the left, the one thing to
 * do next on the right. The next action is always in the same place.
 */
export function ActionBar({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed z-20 bottom-0 inset-x-0 bg-card/90 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[1480px] mx-auto px-3 sm:px-5 h-16 flex items-center gap-3">
        <div className="flex-1 min-w-0 text-[13px] text-ink-2 truncate">{summary}</div>
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      </div>
    </div>
  );
}

/** One figure in the action bar summary: a value and what it counts. */
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 mr-4 last:mr-0">
      <span className="font-mono tabular-nums text-ink font-medium">{value}</span>
      <span>{label}</span>
    </span>
  );
}
