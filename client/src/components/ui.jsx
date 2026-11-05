import { AlertCircle, Check, CircleHelp, Minus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BAND_LABEL, CONFIDENCE_LABEL, STAGE_LABEL, bandOf, escapeRe } from '../fmt.js';

/* ---------- Toasts ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.tone === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Score meter: one segment per criterion, width = weight, fill = points earned ---------- */
const STATUS_ICON = { met: Check, partial: Minus, missing: X, unknown: CircleHelp };
export const STATUS_LABEL = { met: 'Met', partial: 'Partly met', missing: 'Not found', unknown: 'Could not verify' };

export function StatusIcon({ status }) {
  const Icon = STATUS_ICON[status] ?? CircleHelp;
  return (
    <span className={`status-icon ${status}`} aria-label={STATUS_LABEL[status]}>
      <Icon size={12} strokeWidth={3} />
    </span>
  );
}

export function Meter({ criteria = [], size = 'sm', unscored = false }) {
  if (unscored || !criteria.length) return <div className={`meter ${size} empty`} role="img" aria-label="Not scored" />;
  return (
    <div
      className={`meter ${size}`}
      role="img"
      aria-label={criteria.map((c) => `${c.label}: ${STATUS_LABEL[c.status]}`).join(', ')}
    >
      {criteria.map((c, i) => (
        <span
          key={c.label}
          className={`seg ${c.status}`}
          style={{ flexGrow: c.points, '--i': i }}
          title={`${c.label}: ${STATUS_LABEL[c.status]}`}
        >
          <i style={{ width: `${c.points ? Math.min(100, (c.earned / c.points) * 100) : 0}%` }} />
        </span>
      ))}
    </div>
  );
}

export function Score({ value, size = 'md' }) {
  const band = bandOf(value);
  return (
    <div className={`score ${band} ${size}`} title={BAND_LABEL[band]}>
      <b>{value == null ? '–' : Math.round(value)}</b>
      {value != null && size !== 'sm' && <small>/100</small>}
    </div>
  );
}

export const BandTag = ({ score }) => <span className={`tag band-${bandOf(score)}`}>{BAND_LABEL[bandOf(score)]}</span>;
export const ConfidenceTag = ({ level }) => <span className={`tag conf-${level}`}>{CONFIDENCE_LABEL[level]}</span>;
export const StagePill = ({ stage }) => <span className={`pill stage-${stage}`}>{STAGE_LABEL[stage]}</span>;

/** Wraps the matched term inside a verbatim CV quote. */
export function Highlight({ text, term }) {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${escapeRe(term)})`, 'i'));
  return parts.map((part, i) => (part.toLowerCase() === term.toLowerCase() ? <mark key={i}>{part}</mark> : part));
}

/* ---------- States ---------- */
export const Skeleton = ({ lines = 3, className = '' }) => (
  <div className={`skeleton-block ${className}`} aria-hidden="true">
    {Array.from({ length: lines }, (_, i) => (
      <span key={i} className="skeleton" style={{ width: `${92 - i * 14}%` }} />
    ))}
  </div>
);

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={22} />
        </span>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty error" role="alert">
      <span className="empty-icon">
        <AlertCircle size={22} />
      </span>
      <h3>We could not load this</h3>
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/* ---------- Overlays ---------- */
function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function useLockScroll() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

export function Drawer({ onClose, label, children }) {
  useEscape(onClose);
  useLockScroll();
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        {children}
      </aside>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEscape(onClose);
  useLockScroll();
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Asks for a short written reason (reject, erase). `onSubmit` may throw to keep the dialog open. */
export function ReasonModal({ title, label, placeholder, confirmLabel, danger = true, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const valid = reason.trim().length >= 3;
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={!valid || busy} onClick={submit}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <textarea
          autoFocus
          rows={3}
          maxLength={300}
          value={reason}
          placeholder={placeholder}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
    </Modal>
  );
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#172033" />
      <rect x="7" y="9" width="18" height="3.5" rx="1.75" fill="#35c79a" />
      <rect x="7" y="15" width="12" height="3.5" rx="1.75" fill="#fff" fillOpacity=".7" />
      <rect x="7" y="21" width="6" height="3.5" rx="1.75" fill="#fff" fillOpacity=".4" />
    </svg>
  );
}

export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
