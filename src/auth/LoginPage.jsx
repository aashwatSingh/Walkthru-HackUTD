import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider.jsx';
import TwoFactorModal from './TwoFactorModal.jsx';
import { Mark } from '../components/brand.jsx';
import { DEMO_USERS, demoEnabled, isMockMode } from '../lib/dbService.js';
import { homeFor, safeNext } from '../lib/rules.js';

const TONES = { admin: 'bg-violet/30 text-[#ecdfff]', alex: 'bg-matrix/20 text-matrix', jordan: 'bg-cyan-400/20 text-neon', sam: 'bg-warn/20 text-warn' };

export default function LoginPage() {
  const { profile, mfaVerified, secondFactor, signIn, verify2fa, demoSignIn, signOut } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next')); // never leave this site after login
  const [email, setEmail] = useState(() => params.get('email') || '');
  const [notice, setNotice] = useState(() => (params.get('email') ? 'Enter the housing admin password, then the 2FA code.' : ''));
  const passwordRef = useRef(null);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(''); // which quick-login card is signing in
  const [error, setError] = useState('');
  const formRef = useRef(null);

  // Arriving from the switcher's Admin button: the email is filled in, so jump straight to the password.
  useEffect(() => {
    if (params.get('email')) passwordRef.current?.focus();
  }, [params]);

  if (profile && mfaVerified) return <Navigate to={next || homeFor(profile)} replace />;

  const go = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      // a short shake, without remounting the form (focus and typed values stay put)
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        formRef.current?.animate?.([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
      }
    } finally {
      setBusy(false);
      setPending('');
    }
  };

  const quick = (u) => {
    if (u.needsPassword) {
      setEmail(u.email);
      setPassword('');
      setError('');
      setNotice('Enter the housing admin password, then the 2FA code.');
      passwordRef.current?.focus();
      return undefined;
    }
    setPending(u.key);
    return go(async () => {
      const p = await demoSignIn(u.email);
      navigate(next || (p.role === 'admin' ? '/admin' : `/inspect/${u.unit}`), { replace: true });
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-8 inline-flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-neon"><ArrowLeft size={14} /> Back to the site</Link>
      <div className="animate-rise mb-6 flex items-center gap-3.5">
        <Mark size={48} className="shadow-[0_0_28px_rgb(0_240_255/0.25)]" />
        <div>
          <h1 className="display text-[26px]">Walkthrough</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your room’s inspection record.</p>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); go(() => signIn(email, password)); }}
        className="panel animate-rise space-y-4 p-5 [animation-delay:60ms]"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <span className="text-[15px] font-semibold">Sign in</span>
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-matrix"><ShieldCheck size={14} aria-hidden /> {isMockMode ? 'Two-factor on' : 'Two-factor for staff'}</span>
        </div>
        <label className="label">University email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="field mt-1.5 py-2.5 font-mono text-[15px]" placeholder="you@university.edu" />
        </label>
        <div>
          <label className="label" htmlFor="login-password">Password</label>
          <div className="relative mt-1.5">
            <input id="login-password" ref={passwordRef} type={reveal ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="field py-2.5 pr-11 font-mono text-[15px]" />
            <button type="button" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Hide characters' : 'Show characters'} aria-pressed={reveal}
              className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-neon">
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {notice && !error && <p className="animate-rise flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 p-2.5 text-sm text-cyan-50" role="status"><Lock size={15} className="shrink-0 text-neon" /> {notice}</p>}
        {error && <p className="rounded-lg border border-alert/50 bg-alert/10 p-2.5 text-sm text-[#ffd0dd]" role="alert">{error}</p>}
        <button disabled={busy} className="btn btn-primary btn-lg w-full">
          {busy && !pending ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} {busy && !pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {demoEnabled && (
        <div className="animate-rise mt-5 [animation-delay:120ms]">
          <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-soft">
            Demo quick login {isMockMode && <span className="chip border-warn/45 bg-warn/10 font-medium text-warn">sample data</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => (
              <button key={u.key} disabled={busy} onClick={() => quick(u)} data-lit
                className="group flex items-center gap-2.5 rounded-xl border border-line bg-obsidian px-3 py-2.5 text-left text-sm transition-[background-color,border-color] duration-150 hover:border-cyan-400/40 hover:bg-royal disabled:opacity-60">
                <span className="min-w-0 flex-1">
                  <b className="flex items-center gap-1.5">{u.label}{u.needsPassword && <Lock size={13} className="text-neon" aria-hidden />}</b>
                  <span className="block truncate text-[12px] text-muted-foreground">{u.note}</span>
                </span>
                <span aria-hidden className={`order-first flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-semibold ${TONES[u.key] || TONES.admin}`}>
                  {pending === u.key ? <Loader2 size={15} className="animate-spin" /> : u.label[0]}
                </span>
                <ArrowRight aria-hidden size={15} className="shrink-0 -translate-x-1 text-neon opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
          {isMockMode && <p className="mt-3 text-[12.5px] text-muted-foreground">Or type any demo email with password <code className="rounded bg-cyan-400/10 px-1 py-0.5 font-mono text-neon">demo1234</code>.</p>}
        </div>
      )}

      {profile && secondFactor && !mfaVerified && (
        <TwoFactorModal
          factor={secondFactor}
          email={profile.email}
          onVerify={async (code, factor) => {
            await verify2fa(code, factor); // throws with a message for a wrong code
            navigate(next || homeFor(profile), { replace: true });
          }}
          onCancel={signOut}
        />
      )}
    </div>
  );
}
