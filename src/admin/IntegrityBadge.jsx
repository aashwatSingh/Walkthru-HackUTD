import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { verifyMedia } from '../lib/dbService.js';
import { fmtTime, shortHash } from '../lib/format.js';

// Re-hashes the stored file in the browser and compares it with the SHA-256 recorded at upload time.
export default function IntegrityBadge({ path, sha, capturedAt }) {
  const [state, setState] = useState('loading'); // loading | ok | bad | none | error
  useEffect(() => {
    let live = true;
    if (!path) return;
    if (!sha) { setState('none'); return; }
    setState('loading');
    verifyMedia(path, sha).then((ok) => live && setState(ok ? 'ok' : 'bad')).catch(() => live && setState('error'));
    return () => { live = false; };
  }, [path, sha]);
  if (!path) return null;

  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium';
  if (state === 'loading') return <span className={`${base} bg-slate-100 text-slate-500`}><Loader2 size={13} className="animate-spin" /> Verifying…</span>;
  if (state === 'ok') return <span title={sha} className={`${base} bg-emerald-100 text-emerald-800`}><ShieldCheck size={13} /> Fingerprint matches upload{capturedAt ? ` at ${fmtTime(capturedAt)}` : ''} · {shortHash(sha)}</span>;
  if (state === 'bad') return <span title={sha} className={`${base} bg-red-100 text-red-800`}><ShieldAlert size={13} /> Mismatch: file changed since upload</span>;
  if (state === 'error') return <span className={`${base} bg-slate-100 text-slate-500`}><ShieldQuestion size={13} /> Could not verify</span>;
  return <span className={`${base} bg-slate-100 text-slate-500`}><ShieldQuestion size={13} /> Not fingerprinted</span>;
}
