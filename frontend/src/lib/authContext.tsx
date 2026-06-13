// Auth context: holds the current token + user and exposes login/logout.
// The token is persisted (localStorage) so the session survives a refresh;
// the user object is kept in memory only and re-fetched as needed.
//
// It also loads lightweight "viewer status" once authenticated — whether the
// user has a founder profile, is an approved VC, and is an admin — so routing
// and nav visibility have a single source of truth.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from './apiClient';
import type { FounderProfile, User, VCMe } from '../types';

interface ViewerStatus {
  hasProfile: boolean;
  isVc: boolean;
  isAdmin: boolean;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  // Viewer status (valid once viewerLoading is false).
  viewerLoading: boolean;
  hasProfile: boolean;
  isVc: boolean;
  isAdmin: boolean;
  login: (token: string, user?: User) => void;
  logout: () => void;
  // Re-load viewer status without a token change (e.g. after creating a profile).
  refreshViewer: () => Promise<void>;
}

const EMPTY_VIEWER: ViewerStatus = { hasProfile: false, isVc: false, isAdmin: false };

// Probe the three status endpoints. Each failure degrades to "no access" so a
// logged-out/expired token never grants anything. /api/admin/me 403s for
// non-admins (read as not-admin); /api/vc/me returns approved=false for non-VCs.
async function loadViewer(): Promise<ViewerStatus> {
  const [profile, vc, isAdmin] = await Promise.all([
    api.get<FounderProfile | null>('/api/profile/me').catch(() => null),
    api.get<VCMe>('/api/vc/me').catch(() => null),
    api
      .get('/api/admin/me')
      .then(() => true)
      .catch(() => false),
  ]);
  return { hasProfile: Boolean(profile), isVc: Boolean(vc?.approved), isAdmin };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);
  const [viewer, setViewer] = useState<ViewerStatus>(EMPTY_VIEWER);
  const [viewerLoading, setViewerLoading] = useState<boolean>(() => Boolean(getToken()));

  const refreshViewer = useCallback(async () => {
    if (!getToken()) {
      setViewer(EMPTY_VIEWER);
      setViewerLoading(false);
      return;
    }
    setViewerLoading(true);
    try {
      setViewer(await loadViewer());
    } catch {
      setViewer(EMPTY_VIEWER);
    } finally {
      setViewerLoading(false);
    }
  }, []);

  // Reload viewer status whenever the token changes (login/logout/refresh).
  useEffect(() => {
    let active = true;
    if (!token) {
      setViewer(EMPTY_VIEWER);
      setViewerLoading(false);
      return;
    }
    setViewerLoading(true);
    loadViewer()
      .then((v) => {
        if (active) setViewer(v);
      })
      .catch(() => {
        if (active) setViewer(EMPTY_VIEWER);
      })
      .finally(() => {
        if (active) setViewerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      viewerLoading,
      hasProfile: viewer.hasProfile,
      isVc: viewer.isVc,
      isAdmin: viewer.isAdmin,
      login: (newToken: string, newUser?: User) => {
        setToken(newToken);
        setTokenState(newToken);
        if (newUser) setUser(newUser);
      },
      logout: () => {
        clearToken();
        setTokenState(null);
        setUser(null);
        setViewer(EMPTY_VIEWER);
      },
      refreshViewer,
    }),
    [token, user, viewer, viewerLoading, refreshViewer]
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
