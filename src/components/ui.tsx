import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'plain' | 'ghost' | 'danger';

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
        'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap transition-[background,color,box-shadow,opacity] duration-150 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer select-none',
        size === 'sm' && (children ? 'h-8 px-3 text-[13px]' : 'h-8 w-8'),
        size === 'md' && (children ? 'h-9 px-3.5 text-[14px]' : 'h-9 w-9'),
        size === 'lg' && 'h-11 px-5 text-[15px]',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]',
        variant === 'secondary' && 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-raised',
        variant === 'plain' && 'text-accent hover:bg-accent-soft',
        variant === 'ghost' && 'text-ink-2 hover:text-ink hover:bg-fill',
        variant === 'danger' && 'text-danger bg-danger-soft hover:brightness-95',
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon ? <Icon name={icon} size={size === 'lg' ? 17 : size === 'sm' ? 15 : 16} /> : null}
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
    <As className={cx('bg-card rounded-[12px] border border-line shadow-(--shadow-card)', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, detail, action, marker }: { title: string; detail?: ReactNode; action?: ReactNode; marker?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex-1 min-w-0">
        <h2 className="text-[15px] font-semibold flex items-center gap-2">
          {marker ? <span aria-hidden="true" className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: marker }} /> : null}
          {title}
        </h2>
        {detail ? <div className="text-[13px] text-ink-2 mt-0.5">{detail}</div> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * A collapsible group inside a panel. The summary line says what is set, so a closed section
 * still tells you its state.
 */
export function Section({ title, summary, children, defaultOpen = false, open: controlled, onToggle }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; open?: boolean; onToggle?: (v: boolean) => void }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const id = useId();
  const toggle = () => (onToggle ? onToggle(!open) : setOwn(!open));
  return (
    <div className="border-t border-line first:border-t-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} className="w-full flex items-center gap-2 py-3 text-left cursor-pointer group">
        <Icon name="chevronRight" size={14} strokeWidth={2.2} className={cx('text-ink-3 transition-transform shrink-0', open && 'rotate-90')} />
        <span className="text-[14px] font-semibold">{title}</span>
        {summary && !open ? <span className="flex-1 min-w-0 truncate text-right text-[12px] text-ink-3">{summary}</span> : null}
      </button>
      {open ? (
        <div id={id} className="pb-4 animate-fade">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  full,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  full?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('p-0.5 rounded-[8px] bg-fill shadow-[inset_0_0_0_1px_var(--color-line)]', full ? 'flex w-full' : 'inline-flex')}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-[6px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap',
              full && 'flex-1',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              on ? 'bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--color-line)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, detail }: { checked: boolean; onChange: (v: boolean) => void; label: string; detail?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 py-2">
      <label htmlFor={id} className="flex-1 cursor-pointer min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        {detail ? <span className="block text-[12px] text-ink-2 leading-snug mt-0.5">{detail}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 w-[34px] h-[20px] rounded-full transition-colors duration-200 cursor-pointer shrink-0', checked ? 'bg-success' : 'bg-fill-2 shadow-[inset_0_0_0_1px_var(--color-line)]')}
      >
        <span className={cx('absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200', checked && 'translate-x-[14px]')} />
      </button>
    </div>
  );
}

const fieldCls =
  'w-full rounded-[8px] bg-card px-3 text-[14px] text-ink placeholder:text-ink-3 outline-none shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1.5px_var(--color-accent),0_0_0_3px_var(--color-accent-soft)] transition-shadow';

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
  mono,
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
  mono?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cx('text-[12px] font-medium text-ink-2', hideLabel && 'sr-only')}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(fieldCls, 'py-2 resize-none')} autoFocus={autoFocus} />
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
          className={cx(fieldCls, 'h-9', mono && 'font-mono text-[13px]')}
        />
      )}
    </div>
  );
}

export const inputCls = fieldCls;

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'accent' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 h-[22px] px-2 rounded-[6px] text-[12px] font-medium whitespace-nowrap',
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
        'm-auto p-0 rounded-[14px] bg-card text-ink shadow-(--shadow-float) backdrop:bg-black/40 backdrop:backdrop-blur-[2px] w-[calc(100%-32px)] open:animate-rise',
        wide ? 'max-w-[760px]' : 'max-w-[460px]',
      )}
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <h2 className="flex-1 text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1.5 -mt-1 rounded-[8px] hover:bg-fill flex items-center justify-center text-ink-2 cursor-pointer">
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
      className="group relative rounded-[10px] border border-dashed border-line-strong hover:border-accent data-[over=true]:border-accent data-[over=true]:bg-accent-soft transition-colors"
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
      <button type="button" onClick={() => input.current?.click()} className="w-full text-left cursor-pointer rounded-[10px]">
        {children}
      </button>
    </div>
  );
}

/** A label on the left and its control on the right, for dense settings lists. */
export function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-3 min-h-9 flex-wrap">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="w-[88px] shrink-0 text-[13px] text-ink-2">
          {label}
        </label>
      ) : (
        <span className="w-[88px] shrink-0 text-[13px] text-ink-2">{label}</span>
      )}
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
    </div>
  );
}

export function Swatch({ hex, size = 20, label }: { hex: string; size?: number; label?: string }) {
  return (
    <span
      title={label ?? hex}
      className="inline-block rounded-[5px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] shrink-0"
      style={{ width: size, height: size, background: hex || 'repeating-linear-gradient(135deg, var(--color-fill-2) 0 3px, var(--color-card) 3px 6px)' }}
    />
  );
}

/** Pick one colour from a list of named swatches. An empty hex means "default". */
export function ColorChips({ label, colors, value, onChange }: { label: string; colors: { role: string; hex: string }[]; value: string; onChange: (hex: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={(c.hex || 'none') + c.role}
          type="button"
          role="radio"
          aria-checked={value === c.hex}
          aria-label={c.hex ? `${c.role} ${c.hex}` : c.role}
          title={c.hex ? `${c.role} ${c.hex.toUpperCase()}` : c.role}
          onClick={() => onChange(c.hex)}
          className={cx('rounded-[7px] p-[2px] cursor-pointer transition-shadow', value === c.hex ? 'shadow-[0_0_0_2px_var(--color-accent)]' : 'hover:shadow-[0_0_0_2px_var(--color-line-strong)]')}
        >
          <Swatch hex={c.hex} size={22} label={c.role} />
        </button>
      ))}
    </div>
  );
}

/** Multi-select pill buttons. */
export function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  mono,
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T[];
  onChange: (v: T[]) => void;
  mono?: boolean;
}) {
  const order = options.map((x) => x.value);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = value.includes(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={on}
            disabled={opt.disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== opt.value) : [...value, opt.value].sort((a, b) => order.indexOf(a) - order.indexOf(b)))}
            className={cx(
              'h-7 min-w-11 px-2.5 rounded-[6px] text-[12px] cursor-pointer transition-colors disabled:cursor-default',
              mono && 'font-mono tabular-nums',
              on ? 'bg-ink text-canvas' : 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-raised',
              opt.disabled && 'opacity-70',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
