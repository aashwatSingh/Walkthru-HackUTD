import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { verifyMedia } from '../lib/dbService.js';
import { fmtTime, shortHash } from '../lib/format.js';

// Re-hashes the stored file in the browser and compares it with the SHA-256 the server computed from the stored
// file when it was registered (register-evidence Edge Function, migration 008). Neither the student nor housing
// can write that value, so a mismatch means the file changed after upload.
export default function IntegrityBadge({ path, sha, capturedAt }) {
  const [state, setState] = useState('loading'); // loading | ok | bad | none | error
  useEffect(() => {
    let live = true;
    if (!path) return undefined;
    if (!sha) { setState('none'); return undefined; }
    setState('loading');
    verifyMedia(path, sha).then((ok) => live && setState(ok ? 'ok' : 'bad')).catch(() => live && setState('error'));
    return () => { live = false; };
  }, [path, sha]);
  if (!path) return null;

  const base = 'flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] font-medium';
  if (state === 'loading') return <p className={`${base} border-line text-muted-foreground`}><Loader2 size={14} className="animate-spin text-neon" aria-hidden /> Checking the fingerprint…</p>;
  if (state === 'ok') return (
    <p key="ok" title={sha} className={`${base} animate-tick border-cyan-400/50 bg-cyan-400/10 text-neon shadow-[0_0_18px_-6px_rgb(0_240_255/0.6)]`}>
      <ShieldCheck size={14} aria-hidden /> Fingerprint matches upload{capturedAt ? ` at ${fmtTime(capturedAt)}` : ''} <span className="font-mono text-[11px] text-cyan-100/80">· {shortHash(sha)}</span>
    </p>
  );
  if (state === 'bad') return <p key="bad" title={sha} className={`${base} animate-shake border-alert/60 bg-alert/15 text-blush`}><ShieldAlert size={14} aria-hidden /> Mismatch: file changed since upload</p>;
  if (state === 'error') return <p className={`${base} border-line text-muted-foreground`}><ShieldQuestion size={14} aria-hidden /> Could not verify the fingerprint</p>;
  return <p className={`${base} border-line text-muted-foreground`}><ShieldQuestion size={14} aria-hidden /> Not fingerprinted</p>;
}
