import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { PHASE_META, STATUS_META } from '../lib/format.js';
import { getMediaUrl } from '../lib/dbService.js';

export function Spinner({ label = '' }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-slate-500" role="status">
      <Loader2 className="animate-spin" size={20} /> {label}
    </div>
  );
}

export const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.UNREVIEWED;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};

export const PhaseBadge = ({ phase }) => {
  const m = PHASE_META[phase] || PHASE_META.MOVE_IN_OPEN;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};

export const ZoneBadge = ({ zone }) => (
  <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600">{zone}</span>
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
  if (!path) return <div className={`flex items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400 ${className}`}>No photo</div>;
  if (error) return <div className={`flex items-center justify-center rounded-lg bg-red-50 p-2 text-xs text-red-600 ${className}`}>{error}</div>;
  if (!url) return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
  return type === 'video'
    ? <video src={url} controls playsInline className={`rounded-lg bg-black ${className}`} />
    : <img src={url} alt={alt} className={`rounded-lg object-cover ${className}`} />;
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
          <div key={t.id} className={`flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
            {t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
            <span>{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss"><X size={16} /></button>
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
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-5xl' : 'sm:max-w-md'}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-slate-100"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
