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
    <div className="no-print flex items-center gap-0.5 rounded-[3px] border border-purple-500/25 bg-obsidian/80 p-0.5 font-mono text-[11px] text-foreground" aria-label="Demo role and scenario switcher">
      <Users size={13} className="mx-1.5 text-violet-400" aria-hidden />
      {DEMO_USERS.map((u) => (
        <button key={u.key} disabled={busy} onClick={() => switchTo(u)} title={`${u.label}: ${u.note}`}
          className={`rounded-[2px] px-2 py-1 transition-colors hover:bg-cyan-400/10 hover:text-neon ${profile?.email === u.email ? 'bg-neon font-semibold text-void hover:bg-neon hover:text-void' : ''}`}>
          {u.label}{u.needsPassword && <Lock size={11} className="ml-1 inline -mt-0.5" aria-hidden />}
        </button>
      ))}
      {isMockMode && (
        <button onClick={reset} title="Reset demo data" className="rounded-[2px] p-1.5 text-muted-foreground hover:bg-cyan-400/10 hover:text-neon"><RefreshCw size={13} /></button>
      )}
    </div>
  );
}
