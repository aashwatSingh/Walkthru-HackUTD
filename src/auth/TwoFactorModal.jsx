import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { DEMO_2FA_CODE } from './AuthProvider.jsx';

// 6-box code entry: auto-advance, backspace, paste. Accepts the demo code 123456.
export default function TwoFactorModal({ email, onVerify, onCancel }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const refs = useRef([]);

  useEffect(() => refs.current[0]?.focus(), []);

  const submit = (arr) => {
    const code = arr.join('');
    if (code.length < 6) return;
    if (!onVerify(code)) {
      setError('That code is not right. Try again.');
      setDigits(Array(6).fill(''));
      refs.current[0]?.focus();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07060b]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Two-factor verification">
      <div className="animate-rise w-full max-w-sm rounded-md border border-purple-500/30 bg-royal/95 p-6 shadow-[0_24px_60px_rgb(0_0_0/0.7)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="hud-frame hud-frame-sm rounded-[3px] border border-cyan-400/40 bg-cyan-400/10 p-2 text-neon"><ShieldCheck size={22} /></span>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold">Verification code</h2>
            <p className="text-sm text-muted-foreground">Enter the 6-digit code for <span className="break-all font-mono text-[13px] text-foreground">{email}</span></p>
          </div>
        </div>
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
        <p className="mt-4 rounded-[3px] border border-dashed border-purple-500/30 p-2 text-center font-mono text-[11px] text-muted-foreground">
          DEMO_CODE // <b className="text-neon">{DEMO_2FA_CODE}</b>
        </p>
        <button onClick={onCancel} className="btn btn-ghost mt-3 w-full text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}
