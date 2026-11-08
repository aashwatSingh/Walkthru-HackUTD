import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, LogIn } from 'lucide-react';
import { useAuth } from './AuthProvider.jsx';
import TwoFactorModal from './TwoFactorModal.jsx';
import { DEMO_USERS, demoEnabled, isMockMode } from '../lib/dbService.js';
import { homeFor } from '../lib/rules.js';

export default function LoginPage() {
  const { profile, mfaVerified, signIn, verify2fa, demoSignIn, signOut } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const quick = (u) =>
    go(async () => {
      const p = await demoSignIn(u.email);
      navigate(next || (p.role === 'admin' ? '/admin' : `/inspect/${u.unit}`), { replace: true });
    });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><Building2 size={28} /></span>
        <h1 className="text-2xl font-bold">Walkthrough</h1>
        <p className="mt-1 text-sm text-slate-500">Tamper-proof move-in and move-out inspections</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); go(() => signIn(email, password)); }}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label className="block text-sm font-medium">University email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="you@university.edu" />
        </label>
        <label className="block text-sm font-medium">Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </label>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 font-medium text-white hover:bg-slate-800">
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {demoEnabled && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Demo quick login {isMockMode && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 normal-case">mock data</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => (
              <button key={u.key} disabled={busy} onClick={() => quick(u)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50">
                <b>{u.label}</b><span className="block text-xs text-slate-500">{u.note}</span>
              </button>
            ))}
          </div>
          {isMockMode && <p className="mt-2 text-xs text-slate-500">Or type any demo email with password <code>demo1234</code>.</p>}
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
