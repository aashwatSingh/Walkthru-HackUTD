import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LogOut, QrCode } from 'lucide-react';
import { Logo } from './brand.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import DemoSwitcher from '../auth/DemoSwitcher.jsx';
import { homeFor } from '../lib/rules.js';

const initials = (name = '') => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function AppShell({ children, wide = false }) {
  const { profile, signOut } = useAuth();
  const width = wide ? 'max-w-7xl' : 'max-w-3xl';
  const link = ({ isActive }) =>
    `relative flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-[background-color,color] duration-150 ${isActive
      ? 'bg-cyan-400/[0.12] text-neon after:absolute after:inset-x-3 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-neon after:shadow-[0_0_10px_#00f0ff]'
      : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'}`;
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-void/85 backdrop-blur-md">
        <div className={`mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 ${width}`}>
          <Logo to={profile ? homeFor(profile) : '/'} className="mr-1" />
          {profile?.role === 'admin' && (
            <nav className="flex gap-1" aria-label="Admin">
              <NavLink to="/admin" end className={link}><LayoutDashboard size={15} aria-hidden />Dashboard</NavLink>
              <NavLink to="/admin/qr" className={link}><QrCode size={15} aria-hidden />QR codes</NavLink>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <DemoSwitcher />
            {profile && (
              <>
                <span className="hidden items-center gap-2 rounded-md border border-line bg-white/[0.03] py-1 pl-1 pr-2.5 text-[13px] text-soft sm:inline-flex" title={profile.email}>
                  <span aria-hidden className="flex size-6 items-center justify-center rounded bg-violet/30 font-mono text-[10px] font-semibold text-[#ecdfff]">{initials(profile.full_name)}</span>
                  {profile.full_name}
                </span>
                <button onClick={signOut} title="Sign out" aria-label="Sign out" className="btn btn-ghost btn-icon text-muted-foreground"><LogOut size={18} /></button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={`animate-rise relative mx-auto px-4 py-6 ${width}`}>{children}</main>
    </div>
  );
}
