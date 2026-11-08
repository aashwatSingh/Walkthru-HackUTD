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

  const base = 'hud-pill max-w-full flex-wrap whitespace-normal py-1 text-left text-[11px]';
  if (state === 'loading') return <span className={`${base} border-purple-500/30 text-muted-foreground`}><Loader2 size={12} className="animate-spin" /> [SHA256 // VERIFYING…]</span>;
  if (state === 'ok') return (
    <span title={sha} className={`${base} border-cyan-400/50 bg-cyan-400/10 text-neon shadow-[0_0_10px_rgb(0_240_255/0.15)]`}>
      <ShieldCheck size={12} /> <span className="opacity-70">[SHA256 // VERIFIED]</span> Fingerprint matches upload{capturedAt ? ` at ${fmtTime(capturedAt)}` : ''} · {shortHash(sha)}
    </span>
  );
  if (state === 'bad') return <span title={sha} className={`${base} border-rose-500/60 bg-rose-500/15 text-[#FF5C8D]`}><ShieldAlert size={12} /> [SHA256 // MISMATCH] file changed since upload</span>;
  if (state === 'error') return <span className={`${base} border-purple-500/30 text-muted-foreground`}><ShieldQuestion size={12} /> [SHA256 // UNVERIFIED] Could not verify</span>;
  return <span className={`${base} border-purple-500/30 text-muted-foreground`}><ShieldQuestion size={12} /> [SHA256 // NONE] Not fingerprinted</span>;
}
