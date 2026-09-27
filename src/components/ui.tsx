import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'plain' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  busy,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: IconName; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background,color,transform,opacity] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed cursor-pointer select-none',
        size === 'sm' && 'h-8 px-3.5 text-[13px]',
        size === 'md' && 'h-10 px-5 text-[15px]',
        size === 'lg' && 'h-12 px-7 text-[17px]',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'bg-fill text-ink hover:bg-fill-2',
        variant === 'plain' && 'text-accent hover:bg-accent-soft',
        variant === 'danger' && 'bg-danger-soft text-danger hover:brightness-95',
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner size={size === 'sm' ? 14 : 16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside'; 'aria-label'?: string }) {
  return (
    <As className={cx('bg-card rounded-[22px] shadow-(--shadow-card)', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, detail, action }: { title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex-1 min-w-0">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
        {detail ? <div className="text-[13px] text-ink-2 mt-0.5">{detail}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-[10px] bg-fill">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-[8px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
              size === 'sm' ? 'h-7 px-3 text-[12px]' : 'h-8 px-3.5 text-[13px]',
              on ? 'bg-card text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, detail }: { checked: boolean; onChange: (v: boolean) => void; label: string; detail?: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 min-h-11">
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-[15px]">{label}</span>
        {detail ? <span className="block text-[13px] text-ink-2">{detail}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-[51px] h-[31px] rounded-full transition-colors duration-200 cursor-pointer shrink-0', checked ? 'bg-success' : 'bg-fill-2')}
      >
        <span
          className={cx(
            'absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-transform duration-200',
            checked && 'translate-x-[20px]',
          )}
        />
      </button>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
  onEnter,
  type = 'text',
  hideLabel,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  onEnter?: () => void;
  type?: string;
  hideLabel?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const cls =
    'w-full rounded-[12px] bg-fill px-3.5 text-[15px] text-ink placeholder:text-ink-3 outline-none border border-transparent focus:border-accent focus:bg-card transition-colors';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cx('text-[13px] font-medium text-ink-2', hideLabel && 'sr-only')}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(cls, 'py-2.5 resize-none')} autoFocus={autoFocus} />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          className={cx(cls, 'h-11')}
        />
      )}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'accent' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-fill text-ink-2',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'danger' && 'bg-danger-soft text-danger',
      )}
    >
      {children}
    </span>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={cx(
        'm-auto p-0 rounded-[22px] bg-card text-ink shadow-(--shadow-float) backdrop:bg-black/35 backdrop:backdrop-blur-sm w-[calc(100%-32px)] open:animate-rise',
        wide ? 'max-w-[720px]' : 'max-w-[480px]',
      )}
    >
      {open ? (
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-3 mb-5">
            <h2 className="flex-1 text-[22px] font-semibold tracking-[-0.025em]">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-full bg-fill hover:bg-fill-2 flex items-center justify-center text-ink-2 cursor-pointer">
              <Icon name="x" size={16} strokeWidth={2.2} />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** Our own traced SVG (numbers + hex fills only) rendered inline. */
export function SvgView({ svg, className, label }: { svg: string; className?: string; label?: string }) {
  return <div role={label ? 'img' : undefined} aria-label={label} className={cx('svg-fill', className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function DropZone({
  accept,
  onFile,
  children,
  label,
  multiple,
}: {
  accept: string;
  onFile: (f: File) => void;
  children: ReactNode;
  label: string;
  /** Call onFile once per dropped or chosen file. */
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.dataset.over = 'true';
      }}
      onDragLeave={(e) => delete e.currentTarget.dataset.over}
      onDrop={(e) => {
        e.preventDefault();
        delete e.currentTarget.dataset.over;
        const list = [...(e.dataTransfer.files ?? [])];
        (multiple ? list : list.slice(0, 1)).forEach(onFile);
      }}
      className="group relative rounded-[16px] border-[1.5px] border-dashed border-line-strong data-[over=true]:border-accent data-[over=true]:bg-accent-soft transition-colors"
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          (multiple ? list : list.slice(0, 1)).forEach(onFile);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="w-full text-left cursor-pointer rounded-[16px]">
        {children}
      </button>
    </div>
  );
}
