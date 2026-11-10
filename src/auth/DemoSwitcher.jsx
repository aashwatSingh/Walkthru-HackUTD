import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, RefreshCw, Users } from 'lucide-react';
import { useAuth } from './AuthProvider.jsx';
import { DEMO_USERS, demoEnabled, isMockMode, resetDemo } from '../lib/dbService.js';

// Top-right "Demo Role & Scenario Switcher": one click = sign out → sign in as that user → go to their screen.
export default function DemoSwitcher() {
  const { profile, demoSignIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!demoEnabled) return null;

  const switchTo = async (u) => {
    setBusy(true);
    try {
      // Leave the current page first: otherwise its own role-based redirect races with ours.
      navigate('/switching', { replace: true });
      if (u.needsPassword) {
        // Admin has its own password (not in the site's code): sign out and open the login form for it.
        await signOut();
        navigate(`/login?email=${encodeURIComponent(u.email)}&next=/admin`, { replace: true });
        return;
      }
      await demoSignIn(u.email);
      navigate(u.unit ? `/inspect/${u.unit}` : '/admin', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset all demo data back to the starting sample data?')) return;
    await resetDemo();
    window.location.assign('/login');
  };

  return (
    <div className="no-print flex items-center gap-0.5 rounded-lg border border-line bg-obsidian p-0.5 text-[12.5px] font-medium text-soft" role="group" aria-label="Demo role and scenario switcher">
      <Users size={14} className="mx-1.5 text-lilac" aria-hidden />
      {DEMO_USERS.map((u) => {
        const on = profile?.email === u.email;
        return (
          <button key={u.key} disabled={busy} onClick={() => switchTo(u)} title={`${u.label}: ${u.note}`} aria-pressed={on}
            className={`rounded-md px-2.5 py-1 transition-[background-color,color,box-shadow] duration-150 disabled:opacity-60 ${on ? 'bg-neon font-semibold text-void shadow-[0_0_16px_-2px_rgb(0_240_255/0.7)]' : 'hover:bg-cyan-400/10 hover:text-neon'}`}>
            {u.label}{u.needsPassword && <Lock size={11} className="-mt-0.5 ml-1 inline" aria-hidden />}
          </button>
        );
      })}
      {isMockMode && (
        <button onClick={reset} title="Reset demo data" aria-label="Reset demo data" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-neon"><RefreshCw size={13} /></button>
      )}
    </div>
  );
}
