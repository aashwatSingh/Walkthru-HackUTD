import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, LogIn, ScanLine } from 'lucide-react';
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
      <Link to="/" className="mb-8 inline-flex items-center gap-1.5 self-start font-mono text-xs text-muted-foreground hover:text-neon"><ArrowLeft size={14} /> cd ../walkthrough</Link>
      <div className="mb-6 flex items-center gap-3">
        <span className="hud-frame hud-frame-sm flex size-12 items-center justify-center rounded-[3px] border border-cyan-400/40 bg-cyan-400/10 text-neon shadow-[0_0_24px_rgb(0_240_255/0.2)]"><ScanLine size={24} /></span>
        <div>
          <h1 className="font-heading text-2xl font-bold">Walkthrough</h1>
          <p className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">SECURE_LOGIN // TAMPER-PROOF ROOM EVIDENCE</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); go(() => signIn(email, password)); }}
        className="hud-panel space-y-4 p-5"
      >
        <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
          <span className="hud-label">Authenticate</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#00FF9D]"><span className="live-dot bg-[#00FF9D]" aria-hidden /> 2FA REQUIRED</span>
        </div>
        <label className="block text-sm font-medium">University email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="field mt-1.5 py-2.5 font-mono text-[15px]" placeholder="you@university.edu" />
        </label>
        <label className="block text-sm font-medium">Password
          <input ref={passwordRef} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="field mt-1.5 py-2.5 font-mono text-[15px]" />
        </label>
        {notice && !error && <p className="flex items-center gap-2 rounded-[3px] border border-cyan-400/40 bg-cyan-400/10 p-2.5 text-sm text-cyan-100" role="status"><Lock size={15} className="shrink-0 text-neon" /> {notice}</p>}
        {error && <p className="rounded-[3px] border border-rose-500/50 bg-rose-500/10 p-2.5 text-sm text-[#ffc2d4]" role="alert"><span className="font-mono text-xs text-[#FF2A6D]">[ACCESS_DENIED]</span> {error}</p>}
        <button disabled={busy} className="btn btn-primary btn-lg w-full">
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {demoEnabled && (
        <div className="mt-4 rounded-md border border-dashed border-purple-500/30 bg-obsidian/50 p-4">
          <p className="hud-label mb-3 flex items-center gap-2">
            Demo quick login {isMockMode && <span className="hud-pill border-amber-400/45 bg-amber-400/10 normal-case tracking-normal text-[#FFB800]">mock data</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => (
              <button key={u.key} disabled={busy} onClick={() => quick(u)} className="hud-hover rounded-[3px] border border-purple-500/20 bg-void/60 px-3 py-2.5 text-left text-sm">
                <b className="flex items-center gap-1.5">{u.label}{u.needsPassword && <Lock size={13} className="text-neon" aria-hidden />}</b><span className="block font-mono text-[11px] text-muted-foreground">{u.note}</span>
              </button>
            ))}
          </div>
          {isMockMode && <p className="mt-3 text-xs text-muted-foreground">Or type any demo email with password <code className="font-mono text-neon">demo1234</code>.</p>}
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
