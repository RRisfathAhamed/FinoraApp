import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { goBack } from '../lib/hooks';
import { registerBackCloser } from '../lib/backStack';
import { parseAmount, toDecimalString } from '../lib/money';
import { useToasts, dismissToast, toast } from '../lib/toast';
import { CURRENCIES } from '../lib/money';

/* ------------------------------------------------------------------ screen */

export function Screen({
  title,
  subtitle,
  back,
  actions,
  children,
  footer,
  className = '',
}: {
  title: string;
  subtitle?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page ${className}`}>
      <header className="screen-head">
        {back ? (
          <button className="icon-btn" onClick={() => goBack()} aria-label="Go back">
            <ChevronLeft size={22} />
          </button>
        ) : null}
        <div className="screen-head__text">
          <h1 className="screen-title">{title}</h1>
          {subtitle ? <p className="screen-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="screen-head__actions">{actions}</div> : null}
      </header>
      <div className="page-body">{children}</div>
      {footer}
    </div>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button type="button" className={`card card--pressable ${className}`} onClick={onClick}>
        {children}
      </button>
    );
  }
  return <div className={`card ${className}`}>{children}</div>;
}

export function SectionHead({
  title,
  action,
  sub,
}: {
  title: string;
  action?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub ? <p className="section-sub">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ button */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'outline';
  size?: 'md' | 'sm';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
};

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  block,
  icon,
  className = '',
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button
      {...rest}
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Loader2 size={18} className="spin" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function IconBtn({
  children,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} className={`icon-btn ${className}`} aria-label={label} title={label}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="error-text" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`input ${className}`} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={`textarea ${className}`} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="select-wrap">
      <select {...rest} className={`select ${className}`}>
        {children}
      </select>
      <ChevronRight size={16} className="select-chevron" aria-hidden />
    </div>
  );
}

export function CurrencySelect({
  value,
  onChange,
  label = 'Currency',
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.symbol}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function MoneyInput({
  value,
  currency,
  onChange,
  id,
  placeholder = '0.00',
  autoFocus,
  required,
  error,
}: {
  value: number;
  currency: string;
  onChange: (minor: number) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  error?: boolean;
}) {
  const [text, setText] = useState(() => (value ? toDecimalString(value, currency) : ''));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value ? toDecimalString(value, currency) : '');
  }, [value, currency]);
  return (
    <input
      id={id}
      className={`input input--money ${error ? 'input--error' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      placeholder={placeholder}
      value={text}
      autoFocus={autoFocus}
      required={required}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const parsed = parseAmount(text, currency);
        setText(parsed && parsed !== 0 ? toDecimalString(parsed, currency) : '');
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const parsed = parseAmount(raw, currency);
        onChange(parsed ?? 0);
      }}
    />
  );
}

export function MoneyField({
  label,
  value,
  currency,
  onChange,
  hint,
  error,
  autoFocus,
}: {
  label: string;
  value: number;
  currency: string;
  onChange: (minor: number) => void;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="money-wrap">
        <MoneyInput id={id} value={value} currency={currency} onChange={onChange} autoFocus={autoFocus} />
      </div>
    </Field>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <p className="toggle-label">{label}</p>
        {description ? <p className="hint">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`switch ${checked ? 'switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`seg ${value === option.value ? 'seg--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- list */

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  href,
  danger,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const content = (
    <>
      {icon ? <span className={`list-row__icon ${danger ? 'list-row__icon--danger' : ''}`}>{icon}</span> : null}
      <span className="list-row__text">
        <span className={`list-row__title ${danger ? 'text-danger' : ''}`}>{title}</span>
        {subtitle ? <span className="list-row__sub">{subtitle}</span> : null}
      </span>
      <span className="list-row__trail">{trailing ?? <ChevronRight size={18} className="muted" />}</span>
    </>
  );
  if (href) {
    return (
      <a className="list-row" href={href}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className="list-row" onClick={onClick}>
      {content}
    </button>
  );
}

/* --------------------------------------------------------------------- pills */

export function Pill({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'muted';
  icon?: ReactNode;
}) {
  return (
    <span className={`pill pill--${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export function Progress({
  value,
  max,
  tone = 'brand',
  label,
}: {
  value: number;
  max: number;
  tone?: 'brand' | 'ok' | 'warn' | 'danger';
  label?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      className={`progress progress--${tone}`}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <span className="progress__bar" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------- empty */

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty__icon">{icon}</div> : null}
      <p className="empty__title">{title}</p>
      {body ? <p className="empty__body">{body}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- sheet */

function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
}

function useBackCloser(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!active) return;
    return registerBackCloser(() => closeRef.current());
  }, [active]);
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useOverlay(open, onClose);
  useBackCloser(open, onClose);
  if (!open) return null;
  // Portal to <body>: sheets opened inside .page would otherwise be contained
  // by its animation transform, which breaks the fixed overlay and can leave
  // the sheet off-screen or unclickable.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grip" aria-hidden />
        <div className="sheet__head">
          <div>
            <h2 className="sheet__title">{title}</h2>
            {subtitle ? <p className="sheet__sub">{subtitle}</p> : null}
          </div>
          <IconBtn label="Close" onClick={onClose}>
            <X size={20} />
          </IconBtn>
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Full-screen form used for complex financial workflows. */
export function FullForm({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useOverlay(true, onClose);
  useBackCloser(true, onClose);
  return (
    <div className="fullform" role="dialog" aria-modal="true" aria-label={title}>
      <header className="fullform__head">
        <IconBtn label="Close" onClick={onClose}>
          <X size={22} />
        </IconBtn>
        <div className="fullform__title-wrap">
          <h1 className="fullform__title">{title}</h1>
          {subtitle ? <p className="fullform__sub">{subtitle}</p> : null}
        </div>
        <span className="fullform__spacer" />
      </header>
      <div className="fullform__body">{children}</div>
      {footer ? <div className="fullform__foot">{footer}</div> : null}
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  danger = true,
  requireText,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  requireText?: string;
  busy?: boolean;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!open) setText('');
  }, [open]);
  const blocked = Boolean(requireText) && text.trim() !== requireText;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="btn-row">
          <Btn variant="soft" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            variant={danger ? 'danger' : 'primary'}
            disabled={blocked}
            loading={busy}
            onClick={async () => {
              try {
                await onConfirm();
              } catch (error) {
                toast((error as Error).message, 'error');
              }
            }}
          >
            {confirmLabel}
          </Btn>
        </div>
      }
    >
      <div className="confirm-body">{message}</div>
      {requireText ? (
        <Field label={`Type “${requireText}” to continue`}>
          <Input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" />
        </Field>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ toaster */

export function Toaster() {
  const items = useToasts();
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <button key={item.id} className={`toast toast--${item.kind}`} onClick={() => dismissToast(item.id)}>
          {item.kind === 'success' ? <Check size={16} /> : null}
          <span>{item.message}</span>
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- misc bits */

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'in' | 'out';
}) {
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className={`stat__value ${tone ? `stat__value--${tone}` : ''}`}>{value}</p>
      {hint ? <p className="stat__hint">{hint}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      {message}
    </div>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return src ? (
    <img className="avatar" src={src} alt={name || 'Profile'} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar--initial" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || 'F'}
    </span>
  );
}
