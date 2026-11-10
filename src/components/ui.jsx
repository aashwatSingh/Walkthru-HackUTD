import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, Copy, Loader2, Maximize2, X, XCircle } from 'lucide-react';
import { PHASE_META, STATUS_META, shortHash } from '../lib/format.js';
import { getMediaUrl } from '../lib/dbService.js';

// ───────── pointer light ─────────
// One listener for the whole app: any [data-lit] surface learns where the pointer is (--mx / --my) and the CSS
// in index.css paints a soft glow and a lit border there. Skipped on touch screens.
export function usePointerLight() {
  useEffect(() => {
    if (!window.matchMedia?.('(hover: hover)').matches) return undefined;
    let frame = 0;
    let last = null;
    const paint = () => {
      frame = 0;
      const el = last?.target?.closest?.('[data-lit]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${last.clientX - r.left}px`);
      el.style.setProperty('--my', `${last.clientY - r.top}px`);
    };
    const onMove = (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => { document.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, []);
}

export function Spinner({ label = '' }) {
  return (
    <div className="flex items-center justify-center gap-2.5 p-12 text-sm text-muted-foreground" role="status">
      <Loader2 className="animate-spin text-neon" size={18} /> {label}
    </div>
  );
}

// ───────── chips ─────────
export function Chip({ cls = 'border-violet/35 bg-violet/10 text-lilac', children, live = false, title, className = '' }) {
  return (
    <span className={`chip ${cls} ${className}`} title={title}>
      <span className={`chip-dot ${live ? 'live-dot' : ''}`} aria-hidden />
      {children}
    </span>
  );
}

export const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.UNREVIEWED;
  return <Chip cls={m.cls} title={m.code}>{m.short}</Chip>;
};

export const PhaseBadge = ({ phase }) => {
  const m = PHASE_META[phase] || PHASE_META.MOVE_IN_OPEN;
  return <Chip cls={m.cls} live={m.live} title={phase}>{m.label}</Chip>;
};

export const ZoneBadge = ({ zone }) => (
  <span className="inline-flex items-center rounded-md border border-line bg-white/[0.03] px-2 py-[3px] text-[11.5px] font-medium leading-4 text-soft">{zone}</span>
);

// The SHA-256 fingerprint of a file. Click to copy the full value.
export function Seal({ sha, className = '' }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!sha) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      toast('Fingerprint copied.', 'success');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast(sha, 'info');
    }
  };
  return (
    <button type="button" onClick={copy} title={`SHA-256 ${sha} (click to copy)`} aria-label={`Copy fingerprint ${shortHash(sha)}`}
      className={`seal transition-[background-color,border-color,box-shadow] hover:border-cyan-300 hover:bg-cyan-400/15 hover:shadow-[0_0_14px_-2px_rgb(0_240_255/0.5)] ${className}`}>
      {copied ? <Check size={12} aria-hidden /> : <Copy size={11} className="opacity-70" aria-hidden />}
      <span aria-hidden>sha256 · {shortHash(sha)}</span>
    </button>
  );
}

// ───────── media ─────────
// Resolves a storage path (or /seed/ path) to a URL, then shows the image or video.
// `zoom` makes a photo open full-screen when clicked.
export function MediaView({ path, type = 'image', alt = '', className = '', zoom = false }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setError('');
    if (path) getMediaUrl(path).then((u) => live && setUrl(u)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [path]);
  if (!path) return <div className={`flex items-center justify-center rounded-md border border-dashed border-line bg-void/60 text-xs text-muted-foreground ${className}`}>No photo yet</div>;
  if (error) return <div className={`flex items-center justify-center rounded-md border border-alert/40 bg-alert/10 p-2 text-xs text-blush ${className}`}>{error}</div>;
  if (!url) return <div className={`animate-pulse rounded-md bg-violet/10 ${className}`} />;
  if (type === 'video') return <video src={url} controls playsInline className={`rounded-md bg-black ${className}`} />;
  const img = <img src={url} alt={alt} className={`animate-fade rounded-md object-cover ${className}`} />;
  if (!zoom) return img;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Enlarge photo${alt ? `: ${alt}` : ''}`} className="group/zoom relative block w-full cursor-zoom-in">
        {img}
        <span aria-hidden className="absolute bottom-2 right-2 z-[4] flex size-7 items-center justify-center rounded-md border border-cyan-400/40 bg-black/70 text-neon opacity-0 transition-opacity group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100"><Maximize2 size={14} /></span>
      </button>
      {open && <Lightbox url={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

// The innermost open overlay is the only one that reacts to Escape.
const overlays = [];
function useOverlay(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = {};
    overlays.push(entry);
    const onKey = (e) => {
      if (e.key !== 'Escape' || overlays[overlays.length - 1] !== entry) return;
      e.stopPropagation();
      ref.current();
    };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      overlays.splice(overlays.indexOf(entry), 1);
      if (!overlays.length) document.body.style.overflow = overflow === 'hidden' ? '' : overflow;
    };
  }, []);
}

function Lightbox({ url, alt, onClose }) {
  useOverlay(onClose);
  return createPortal(
    <div className="no-print animate-fade fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-void/92 p-4" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
      <img src={url} alt={alt} className="animate-pop max-h-full max-w-full rounded-lg border border-cyan-400/40 shadow-[0_0_60px_-10px_rgb(0_240_255/0.5)]" />
      <button type="button" onClick={onClose} aria-label="Close photo" className="btn btn-outline btn-icon absolute right-4 top-4"><X size={18} /></button>
    </div>,
    document.body,
  );
}

// MediaView inside a viewfinder: corner brackets, scanlines, and an optional caption bar along the top.
export function EvidenceFrame({ children, label, right, small = false, className = '' }) {
  return (
    <div className={`viewfinder scanlines overflow-hidden rounded-lg border border-line bg-black ${small ? 'viewfinder-sm' : ''} ${className}`}>
      {children}
      {(label || right) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex items-start justify-between gap-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-3 pb-6 pt-2 font-mono text-[10px] tracking-[0.05em] text-cyan-100/90 print:hidden">
          <span className="min-w-0 truncate">{label}</span>
          {right && <span className="shrink-0">{right}</span>}
        </div>
      )}
    </div>
  );
}

// Live ticking UTC clock: 2026-11-07 09:30:00 UTC.
export function HudClock({ className = '' }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <time dateTime={now.toISOString()} className={`tabular-nums ${className}`}>{now.toISOString().slice(0, 19).replace('T', ' ')} UTC</time>;
}

// A value that slides in again whenever it changes (totals, counters).
export const Ticker = ({ value, className = '' }) => <span key={String(value)} className={`animate-tick inline-block ${className}`}>{value}</span>;

// Segmented control. `tabs` gives it tab semantics (comparator views); otherwise it is a group of toggles.
export function Segmented({ options, value, onChange, label, tabs = false, className = '' }) {
  return (
    <div className={`inline-flex rounded-lg border border-line bg-void/60 p-0.5 text-[13px] ${className}`} role={tabs ? 'tablist' : 'group'} aria-label={label}>
      {options.map(([key, text, Icon]) => {
        const on = value === key;
        const state = tabs ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on };
        return (
          <button key={key} type="button" {...state} onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-[background-color,color,box-shadow] duration-150 ${on ? 'bg-cyan-400/15 text-neon shadow-[0_0_16px_-6px_rgb(0_240_255/0.7)]' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`}>
            {Icon && <Icon size={14} aria-hidden />}{text}
          </button>
        );
      })}
    </div>
  );
}

// ───────── toasts ─────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    const life = kind === 'error' ? 7000 : 3500;
    setToasts((t) => [...t, { id, message, kind, life }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), life);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col sm:bottom-5 items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => {
          const tone = t.kind === 'error' ? 'border-alert/60 text-[#ffd0dd]' : t.kind === 'success' ? 'border-cyan-400/60 text-cyan-50' : 'border-violet/50 text-foreground';
          const bar = t.kind === 'error' ? 'bg-alert' : t.kind === 'success' ? 'bg-neon' : 'bg-violet';
          return (
            <div key={t.id} className={`animate-pop pointer-events-auto relative flex max-w-md items-start gap-2.5 overflow-hidden rounded-lg border bg-royal px-4 py-3 text-sm shadow-[0_14px_40px_-8px_rgb(0_0_0/0.8)] ${tone}`}>
              {t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0 text-alert" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-neon" />}
              <span>{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="-mr-1 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"><X size={16} /></button>
              <span aria-hidden className={`absolute inset-x-0 bottom-0 h-0.5 origin-left ${bar}`} style={{ animation: `toast-life ${t.life}ms linear both` }} />
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────── modal ─────────
export function Modal({ title, onClose, children, wide = false, actions = null }) {
  const panel = useRef(null);
  useOverlay(onClose);
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);
  // Rendered on <body>: a page that is animating in would otherwise trap a fixed overlay inside itself.
  return createPortal(
    <div className="no-print animate-fade fixed inset-0 z-50 flex items-end justify-center bg-void/85 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div ref={panel} tabIndex={-1}
        className={`animate-pop max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-royal p-5 shadow-[0_0_0_1px_rgb(0_240_255/0.05),0_30px_80px_-10px_rgb(0_0_0/0.85)] outline-none sm:rounded-2xl sm:p-6 ${wide ? 'sm:max-w-5xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3 border-b border-line pb-3">
          <h2 className="min-w-0 flex-1 text-lg font-bold leading-snug sm:text-xl">{title}</h2>
          {actions}
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon -mr-1.5 -mt-1 size-8 text-muted-foreground"><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// A small copy-to-clipboard text button.
export function CopyButton({ text, label = 'Copy' }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(text); toast('Copied.', 'success'); }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-neon transition-colors hover:bg-cyan-400/10">
      <Copy size={13} aria-hidden /> {label}
    </button>
  );
}
