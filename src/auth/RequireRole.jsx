import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { Spinner } from '../components/ui.jsx';
import { homeFor } from '../lib/rules.js';

// Needs a session AND a passed 2FA step AND the right role. Anything else is redirected.
export default function RequireRole({ role, children }) {
  const { profile, loading, mfaVerified } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Loading…" />;
  if (!profile || !mfaVerified) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  if (role && profile.role !== role) return <Navigate to={homeFor(profile)} replace />;
  return children;
}
