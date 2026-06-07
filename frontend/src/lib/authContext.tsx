// Auth context: holds the current token + user and exposes login/logout.
// Phase 1 scaffolding — it tracks token presence so protected routes work.
// Actual signup/login/profile fetching is wired up in Phase 1.2.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { clearToken, getToken, setToken } from './apiClient';

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  // Keep React state in sync if the token was set elsewhere.
  useEffect(() => {
    setTokenState(getToken());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      login: (newToken: string) => {
        setToken(newToken);
        setTokenState(newToken);
      },
      logout: () => {
        clearToken();
        setTokenState(null);
      },
    }),
    [token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
