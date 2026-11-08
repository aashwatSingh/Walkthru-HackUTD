import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, DoorOpen, Lock, LogIn } from 'lucide-react';
import { useAuth } from './AuthProvider.jsx';
import TwoFactorModal from './TwoFactorModal.jsx';
import { DEMO_USERS, demoEnabled, isMockMode } from '../lib/dbService.js';
import { homeFor } from '../lib/rules.js';

export default function LoginPage() {
  const { profile, mfaVerified, signIn, verify2fa, demoSignIn, signOut } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  const [email, setEmail] = useState(() => params.get('email') || '');
  const [notice, setNotice] = useState(() => (params.get('email') ? 'Enter the housing admin password, then the 2FA code.' : ''));
  const passwordRef = useRef(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    } finally {
      setBusy(false);
    }
  };

  const quick = (u) => {
    if (u.needsPassword) {
      setEmail(u.email);
      setPassword('');
      setError('');
      setNotice('Enter the housing admin password, then the 2FA code.');
      passwordRef.current?.focus();
      return;
    }
    return go(async () => {
      const p = await demoSignIn(u.email);
      navigate(next || (p.role === 'admin' ? '/admin' : `/inspect/${u.unit}`), { replace: true });
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={14} /> Back to Walkthrough</Link>
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><DoorOpen size={28} /></span>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Walkthrough</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tamper-proof move-in and move-out inspections</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); go(() => signIn(email, password)); }}
        className="space-y-3 rounded-2xl border border-white/10 bg-card p-5 shadow-sm"
      >
        <label className="block text-sm font-medium">University email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="field mt-1 py-2.5 text-base" placeholder="you@university.edu" />
        </label>
        <label className="block text-sm font-medium">Password
          <input ref={passwordRef} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="field mt-1 py-2.5 text-base" />
        </label>
        {notice && !error && <p className="flex items-center gap-2 rounded-xl bg-primary/10 p-2.5 text-sm text-primary" role="status"><Lock size={15} /> {notice}</p>}
        {error && <p className="rounded-lg bg-red-400/10 p-2 text-sm text-red-200" role="alert">{error}</p>}
        <button disabled={busy} className="btn btn-primary btn-lg w-full">
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {demoEnabled && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/20 bg-card/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo quick login {isMockMode && <span className="ml-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-200 normal-case">mock data</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => (
              <button key={u.key} disabled={busy} onClick={() => quick(u)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary/10">
                <b className="flex items-center gap-1.5">{u.label}{u.needsPassword && <Lock size={13} className="text-primary" aria-hidden />}</b><span className="block text-xs text-muted-foreground">{u.note}</span>
              </button>
            ))}
          </div>
          {isMockMode && <p className="mt-2 text-xs text-muted-foreground">Or type any demo email with password <code>demo1234</code>.</p>}
        </div>
      )}

      {profile && !mfaVerified && (
        <TwoFactorModal
          email={profile.email}
          onVerify={(code) => {
            const ok = verify2fa(code);
            if (ok) navigate(next || homeFor(profile), { replace: true });
            return ok;
          }}
          onCancel={signOut}
        />
      )}
    </div>
  );
}
