import type { ReactNode } from 'react';

export function StepHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-5 mb-8 sm:mb-10">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-accent mb-2">{eyebrow}</p>
        <h1 className="text-[34px] sm:text-[44px] leading-[1.08] font-semibold tracking-[-0.035em]">{title}</h1>
        <p className="text-[17px] text-ink-2 mt-3 max-w-[640px] leading-snug">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Swatch({ hex, size = 28, label }: { hex: string; size?: number; label?: string }) {
  return (
    <span
      title={label ?? hex}
      className="inline-block rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] shrink-0"
      style={{ width: size, height: size, background: hex }}
    />
  );
}
