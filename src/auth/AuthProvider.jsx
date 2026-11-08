import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as db from '../lib/dbService.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const MFA_KEY = 'walkthru-mfa';
export const DEMO_2FA_CODE = '123456';

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaVerified, setMfaVerified] = useState(false);

  const applyProfile = useCallback((p) => {
    setProfile(p);
    setMfaVerified(!!p && sessionStorage.getItem(MFA_KEY) === p.id);
  }, []);

  useEffect(() => {
    db.restoreSession().then(applyProfile).catch(() => applyProfile(null)).finally(() => setLoading(false));
  }, [applyProfile]);

  const signIn = useCallback(async (email, password) => {
    sessionStorage.removeItem(MFA_KEY);
    const p = await db.signIn(email, password);
    setProfile(p);
    setMfaVerified(false);
    return p;
  }, []);

  // Demo 2FA: a fixed code. Production would use Supabase TOTP MFA + an `aal2` check in RLS (spec Section 11).
  const verify2fa = useCallback(
    (code) => {
      if (code !== DEMO_2FA_CODE) return false;
      sessionStorage.setItem(MFA_KEY, profile.id);
      setMfaVerified(true);
      return true;
    },
    [profile],
  );

  // One click: sign in as a demo user and skip the 2FA screen (Demo switcher).
  const demoSignIn = useCallback(async (email) => {
    const p = await db.signIn(email, db.DEMO_PASSWORD);
    sessionStorage.setItem(MFA_KEY, p.id);
    setProfile(p);
    setMfaVerified(true);
    return p;
  }, []);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(MFA_KEY);
    await db.signOut();
    setProfile(null);
    setMfaVerified(false);
  }, []);

  return (
    <AuthCtx.Provider value={{ profile, loading, mfaVerified, signIn, verify2fa, demoSignIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
