import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as db from '../lib/dbService.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Signed in = a profile. Fully signed in = the second factor is done too (secondFactor.kind === 'none').
// What the second factor is comes from the database layer: nothing for students on the live site, a code from an
// authenticator app for the housing admin (enforced by the database), a fixed demo code in demo mode.
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [secondFactor, setSecondFactor] = useState(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback(async (p) => {
    const factor = p ? await db.getSecondFactor(p) : null;
    setProfile(p);
    setSecondFactor(factor);
    return p;
  }, []);

  useEffect(() => {
    db.restoreSession().then(apply).catch(() => apply(null)).finally(() => setLoading(false));
  }, [apply]);

  const signIn = useCallback(async (email, password) => apply(await db.signIn(email, password)), [apply]);

  // Throws with a message for a wrong code.
  const verify2fa = useCallback(async (code, factor = secondFactor) => {
    await db.verifySecondFactor(factor, code);
    setSecondFactor({ kind: 'none' });
  }, [secondFactor]);

  // One click: sign in as a demo user (Demo switcher and quick-login buttons).
  const demoSignIn = useCallback(async (email) => {
    const p = await db.signIn(email, db.DEMO_PASSWORD);
    await db.skipSecondFactor(p);
    return apply(p);
  }, [apply]);

  const signOut = useCallback(async () => {
    await db.signOut();
    setProfile(null);
    setSecondFactor(null);
  }, []);

  const mfaVerified = !!profile && secondFactor?.kind === 'none';
  return (
    <AuthCtx.Provider value={{ profile, loading, mfaVerified, secondFactor, signIn, verify2fa, demoSignIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
