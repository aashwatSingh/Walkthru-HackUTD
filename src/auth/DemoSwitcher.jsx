import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Users } from 'lucide-react';
import { useAuth } from './AuthProvider.jsx';
import { DEMO_USERS, demoEnabled, isMockMode, resetDemo } from '../lib/dbService.js';

// Top-right "Demo Role & Scenario Switcher": one click = sign out → sign in as that user → go to their screen.
export default function DemoSwitcher() {
  const { profile, demoSignIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!demoEnabled) return null;

  const switchTo = async (u) => {
    setBusy(true);
    try {
      // Leave the current page first: otherwise its own role-based redirect races with ours.
      navigate('/switching', { replace: true });
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
    <div className="no-print flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-xs text-white" aria-label="Demo role and scenario switcher">
      <Users size={14} className="ml-1 opacity-70" />
      {DEMO_USERS.map((u) => (
        <button key={u.key} disabled={busy} onClick={() => switchTo(u)} title={`${u.label}: ${u.note}`}
          className={`rounded-full px-2.5 py-1 hover:bg-slate-600 ${profile?.email === u.email ? 'bg-blue-600' : ''}`}>
          {u.label}
        </button>
      ))}
      {isMockMode && (
        <button onClick={reset} title="Reset demo data" className="rounded-full p-1.5 hover:bg-slate-600"><RefreshCw size={13} /></button>
      )}
    </div>
  );
}
