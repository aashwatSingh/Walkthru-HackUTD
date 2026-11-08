import { Link, NavLink } from 'react-router-dom';
import { Building2, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import DemoSwitcher from '../auth/DemoSwitcher.jsx';
import { homeFor } from '../lib/rules.js';

export default function AppShell({ children, wide = false }) {
  const { profile, signOut } = useAuth();
  const link = ({ isActive }) => `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className={`mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
          <Link to={homeFor(profile)} className="flex items-center gap-2 font-semibold">
            <span className="rounded-lg bg-slate-900 p-1.5 text-white"><Building2 size={16} /></span> Walkthrough
          </Link>
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
                <span className="hidden text-sm text-slate-500 sm:inline">{profile.full_name}</span>
                <button onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><LogOut size={18} /></button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-5 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}
