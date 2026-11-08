import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { PHASE_META, STATUS_META } from '../lib/format.js';
import { getMediaUrl } from '../lib/dbService.js';

export function Spinner({ label = '' }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 font-mono text-sm text-muted-foreground" role="status">
      <Loader2 className="animate-spin text-neon" size={18} /> {label}
    </div>
  );
}

// Terminal-readout chip: [GROUP // VALUE]. The plain-English label is what screen readers hear.
export function Readout({ group, value, cls = 'border-purple-500/30 bg-purple-500/10 text-[#c79bff]', label, dot = false, title }) {
  return (
    <span className={`hud-pill ${cls}`} title={title || label}>
      {dot && <span className="live-dot bg-current" aria-hidden />}
      <span aria-hidden><span className="opacity-60">[</span>{group} <span className="opacity-50">//</span> {value}<span className="opacity-60">]</span></span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.UNREVIEWED;
  return <Readout group={m.code[0]} value={m.code[1]} cls={m.cls} label={m.label} />;
};

export const PhaseBadge = ({ phase }) => {
  const m = PHASE_META[phase] || PHASE_META.MOVE_IN_OPEN;
  return <Readout group="PHASE" value={phase} cls={m.cls} label={m.label} dot={m.live} />;
};

export const ZoneBadge = ({ zone }) => (
  <Readout group="ZONE" value={String(zone || '').toUpperCase().replaceAll(' ', '_')} label={zone} />
);

// Resolves a storage path (or /seed/ path) to a URL, then shows the image or video.
export function MediaView({ path, type = 'image', alt = '', className = '' }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setUrl(null);
    setError('');
    if (path) getMediaUrl(path).then((u) => live && setUrl(u)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [path]);
  if (!path) return <div className={`flex items-center justify-center rounded-[3px] border border-dashed border-purple-500/30 bg-void/60 font-mono text-xs text-muted-foreground ${className}`}>[NO_SIGNAL]</div>;
  if (error) return <div className={`flex items-center justify-center rounded-[3px] border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-[#ff8fb0] ${className}`}>{error}</div>;
  if (!url) return <div className={`animate-pulse rounded-[3px] bg-purple-500/10 ${className}`} />;
  return type === 'video'
    ? <video src={url} controls playsInline className={`rounded-[3px] bg-black ${className}`} />
    : <img src={url} alt={alt} className={`rounded-[3px] object-cover ${className}`} />;
}

// MediaView inside a forensic viewfinder: corner brackets, scanlines, and an optional HUD bar along the top.
export function EvidenceFrame({ children, label, right, small = false, className = '' }) {
  return (
    <div className={`hud-frame scanlines overflow-hidden rounded-[3px] border border-purple-500/25 bg-black ${small ? 'hud-frame-sm' : ''} ${className}`}>
      {children}
      {(label || right) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex items-start justify-between gap-2 print:hidden bg-gradient-to-b from-black/85 via-black/45 to-transparent px-3 pb-6 pt-2 font-mono text-[10px] tracking-[0.06em] text-cyan-100/90">
          <span className="min-w-0 truncate">{label}</span>
          {right && <span className="shrink-0">{right}</span>}
        </div>
      )}
    </div>
  );
}

// Live ticking UTC clock for HUD bars: 2026-11-07 09:30:00 UTC.
export function HudClock({ className = '' }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <time dateTime={now.toISOString()} className={`tabular-nums ${className}`}>{now.toISOString().slice(0, 19).replace('T', ' ')} UTC</time>;
}

// ───────── toasts ─────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`animate-rise flex max-w-md items-start gap-2.5 rounded-[3px] border bg-royal/95 px-4 py-3 text-sm shadow-[0_8px_30px_rgb(0_0_0/0.6)] backdrop-blur-md ${t.kind === 'error' ? 'border-rose-500/60 text-[#ffc2d4]' : t.kind === 'success' ? 'border-cyan-400/60 text-cyan-50' : 'border-purple-500/40 text-foreground'}`}>
            {t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0 text-[#FF2A6D]" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-neon" />}
            <span>{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-[#07060b]/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`animate-rise max-h-[94vh] w-full overflow-y-auto rounded-t-md border border-purple-500/30 bg-royal/95 p-5 shadow-[0_0_0_1px_rgb(0_240_255/0.06),0_24px_60px_rgb(0_0_0/0.7)] backdrop-blur-md sm:rounded-md sm:p-6 ${wide ? 'sm:max-w-5xl' : 'sm:max-w-md'}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-purple-500/20 pb-3">
          <h2 className="font-heading text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-[3px] p-1 text-muted-foreground hover:bg-cyan-400/10 hover:text-neon"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
