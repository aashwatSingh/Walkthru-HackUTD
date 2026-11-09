import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#07060b]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Two-factor verification">
      <div className="animate-rise w-full max-w-sm rounded-md border border-purple-500/30 bg-royal/95 p-6 shadow-[0_24px_60px_rgb(0_0_0/0.7)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="hud-frame hud-frame-sm rounded-[3px] border border-cyan-400/40 bg-cyan-400/10 p-2 text-neon"><ShieldCheck size={22} /></span>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold">{enrolling ? 'Set up two-factor' : 'Verification code'}</h2>
            <p className="text-sm text-muted-foreground">
              {enrolling ? 'Required for the housing admin account ' : 'Enter the 6-digit code for '}
              <span className="break-all font-mono text-[13px] text-foreground">{email}</span>
            </p>
          </div>
        </div>

        {enrolling && (
          <div className="mb-4 space-y-2 text-sm text-[#cfc9e6]">
            <p>1. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password).</p>
            {setup ? (
              <>
                <img src={setup.qr} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-[3px] bg-white p-2" />
                <p className="break-all text-center font-mono text-[11px] text-muted-foreground">Or type this key: <span className="text-foreground">{setup.secret}</span></p>
              </>
            ) : !error && <p className="py-6 text-center font-mono text-xs text-muted-foreground">Preparing the code…</p>}
            <p>2. Enter the 6-digit code the app shows.</p>
          </div>
        )}
        {factor.kind === 'totp' && <p className="mb-4 text-sm text-[#cfc9e6]">Open your authenticator app and enter the current code.</p>}

        <div className="flex justify-between gap-2" onPaste={onPaste}>
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
              className={`h-13 w-11 rounded-[3px] border bg-void text-center font-mono text-xl font-semibold text-neon caret-cyan-400 focus:border-cyan-400/80 focus:shadow-[0_0_12px_rgb(0_240_255/0.3)] focus:outline-none ${d ? 'border-cyan-400/50' : 'border-purple-500/30'}`}
            />
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-[#ff8fb0]" role="alert">{error}</p>}
        {factor.kind === 'demo' && (
          <p className="mt-4 rounded-[3px] border border-dashed border-purple-500/30 p-2 text-center font-mono text-[11px] text-muted-foreground">
            DEMO_CODE // <b className="text-neon">{factor.code}</b>
          </p>
        )}
        <button onClick={onCancel} className="btn btn-ghost mt-3 w-full text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}
