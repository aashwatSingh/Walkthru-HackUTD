import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { startTotpEnrollment } from '../lib/dbService.js';

// 6-box code entry: auto-advance, backspace, paste. `factor.kind` decides what the code is:
//   'totp'   → the housing admin's authenticator app (checked by Supabase; the database requires it)
//   'enroll' → first admin login: scan the QR code with an authenticator app, then enter its code
//   'demo'   → demo mode only: a fixed code shown on screen
export default function TwoFactorModal({ factor, email, onVerify, onCancel }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(null); // { factorId, qr, secret } while enrolling
  const refs = useRef([]);
  const row = useRef(null);
  const enrolling = factor.kind === 'enroll';

  useEffect(() => refs.current[0]?.focus(), []);
  useEffect(() => {
    if (!enrolling) return;
    let live = true;
    startTotpEnrollment().then((s) => live && setSetup(s)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [enrolling]);

  const submit = async (arr) => {
    const code = arr.join('');
    if (code.length < 6 || busy || (enrolling && !setup)) return;
    setBusy(true);
    try {
      await onVerify(code, enrolling ? { kind: 'totp', factorId: setup.factorId } : factor);
    } catch (e) {
      setError(e.message);
      setDigits(Array(6).fill(''));
      refs.current[0]?.focus();
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        row.current?.animate?.([{ transform: 'none' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
      }
    } finally {
      setBusy(false);
    }
  };

  const setAt = (i, v) => {
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError('');
    if (v && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) submit(next);
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill('').map((_, i) => text[i] || '');
    setDigits(next);
    if (next.every(Boolean)) submit(next);
  };

  const filled = digits.filter(Boolean).length;

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-void/85 p-4" role="dialog" aria-modal="true" aria-label="Two-factor verification">
      <div className="animate-pop w-full max-w-sm rounded-2xl border border-line bg-royal p-6 shadow-[0_0_0_1px_rgb(0_240_255/0.05),0_30px_80px_-10px_rgb(0_0_0/0.85)]">
        <div className="mb-5 flex items-center gap-3">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl border transition-[border-color,background-color,color,box-shadow] duration-300 ${busy ? 'border-cyan-300 bg-cyan-400/20 text-neon shadow-[0_0_22px_rgb(0_240_255/0.5)]' : 'border-cyan-400/40 bg-cyan-400/10 text-neon'}`}>
            {busy ? <Loader2 size={22} className="animate-spin" /> : <ShieldCheck size={22} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{enrolling ? 'Set up two-factor' : 'Verification code'}</h2>
            <p className="text-sm text-muted-foreground">
              {enrolling ? 'Required for the housing admin account ' : 'Enter the 6-digit code for '}
              <span className="break-all font-mono text-[13px] text-foreground">{email}</span>
            </p>
          </div>
        </div>

        {enrolling && (
          <div className="mb-4 space-y-2 text-sm text-soft">
            <p>1. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password).</p>
            {setup ? (
              <>
                <img src={setup.qr} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg bg-white p-2" />
                <p className="break-all text-center font-mono text-[11px] text-muted-foreground">Or type this key: <span className="text-foreground">{setup.secret}</span></p>
              </>
            ) : !error && <p className="py-6 text-center text-xs text-muted-foreground">Preparing the code…</p>}
            <p>2. Enter the 6-digit code the app shows.</p>
          </div>
        )}
        {factor.kind === 'totp' && <p className="mb-4 text-sm text-soft">Open your authenticator app and enter the current code.</p>}

        <div ref={row} className="flex justify-between gap-2" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={d}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
              onKeyDown={(e) => e.key === 'Backspace' && !digits[i] && i > 0 && refs.current[i - 1]?.focus()}
              onFocus={(e) => e.target.select()}
              className={`h-13 w-11 rounded-lg border bg-void text-center font-mono text-xl font-semibold text-neon caret-cyan-400 transition-[border-color,box-shadow,transform] duration-150 focus:-translate-y-0.5 focus:border-cyan-300 focus:shadow-[0_0_0_3px_rgb(0_240_255/0.16),0_0_18px_rgb(0_240_255/0.4)] focus:outline-none ${error ? 'border-alert/60' : d ? 'border-cyan-400/60 shadow-[0_0_12px_-2px_rgb(0_240_255/0.5)]' : 'border-input'}`}
            />
          ))}
        </div>
        {/* six cells that light up as the code is typed */}
        <div className="mt-3 flex gap-1" aria-hidden>
          {digits.map((_, i) => <span key={i} className={`h-0.5 flex-1 rounded-full transition-[background-color,box-shadow] duration-200 ${i < filled ? 'bg-neon shadow-[0_0_8px_#00f0ff]' : 'bg-white/10'}`} />)}
        </div>
        {error && <p className="mt-3 text-sm text-blush" role="alert">{error}</p>}
        {factor.kind === 'demo' && (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-line p-2 text-[12.5px] text-muted-foreground">
            Demo code
            <button type="button" onClick={() => { const next = [...String(factor.code)]; setDigits(next); submit(next); }} title="Fill in the demo code"
              className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 font-mono text-[13px] font-semibold tracking-[0.18em] text-neon transition-[background-color,box-shadow] hover:bg-cyan-400/20 hover:shadow-[0_0_14px_-2px_rgb(0_240_255/0.6)]">{factor.code}</button>
          </p>
        )}
        <button onClick={onCancel} className="btn btn-ghost mt-3 w-full text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}
