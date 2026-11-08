import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Logo } from './brand.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import DemoSwitcher from '../auth/DemoSwitcher.jsx';
import { homeFor } from '../lib/rules.js';

export default function AppShell({ children, wide = false }) {
  const { profile, signOut } = useAuth();
  const link = ({ isActive }) => `btn btn-sm font-mono text-xs tracking-[0.04em] ${isActive ? 'border-cyan-400/60 bg-cyan-400/10 text-neon' : 'btn-ghost text-muted-foreground'}`;
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-purple-500/20 bg-void/80 backdrop-blur-md">
        <div className={`mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
          <Logo to={profile ? homeFor(profile) : '/'} className="mr-2" />
          {profile?.role === 'admin' && (
            <nav className="flex gap-1">
              <NavLink to="/admin" end className={link}>Dashboard</NavLink>
              <NavLink to="/admin/qr" className={link}>QR codes</NavLink>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <DemoSwitcher />
            {profile && (
              <>
                <span className="hidden items-center gap-2 font-mono text-xs text-muted-foreground sm:inline-flex"><span className="live-dot bg-[#00FF9D]" aria-hidden />{profile.full_name}</span>
                <button onClick={signOut} title="Sign out" aria-label="Sign out" className="btn btn-ghost size-9 px-0 text-muted-foreground"><LogOut size={18} /></button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={`relative mx-auto px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}
