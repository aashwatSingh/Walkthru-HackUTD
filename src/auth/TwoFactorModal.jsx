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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Two-factor verification">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-xl -rotate-6 bg-primary p-2 text-primary-foreground"><ShieldCheck size={22} /></span>
          <div>
            <h2 className="font-heading tracking-tight text-lg font-semibold">Verification code</h2>
            <p className="text-sm text-muted-foreground">Enter the 6-digit code for {email}</p>
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
              className="h-12 w-11 rounded-lg border border-white/20 text-center text-xl font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
        <p className="mt-4 rounded-lg bg-white/5 p-2 text-center text-xs text-muted-foreground">
          Demo code: <b className="font-mono">{DEMO_2FA_CODE}</b>
        </p>
        <button onClick={onCancel} className="mt-3 w-full rounded-lg py-2 text-sm text-muted-foreground hover:bg-white/10">Cancel</button>
      </div>
    </div>
  );
}
