// Auth context: holds the current token + user and exposes login/logout.
// The token is persisted (localStorage) so the session survives a refresh;
// the user object is kept in memory only and re-fetched as needed.
//
// It also loads lightweight "viewer status" once authenticated — whether the
// user has a founder profile and is an approved VC — so routing and nav
// visibility have a single source of truth. Admin status is NOT probed on cold
// load (non-admins would 403 every load); it is resolved lazily via
// resolveAdmin() only when an admin route mounts, and cached for the session.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, clearToken, getToken, setToken } from './apiClient';
import type { FounderProfile, User, VCMe } from '../types';

interface ViewerStatus {
  hasProfile: boolean;
  isVc: boolean;
}

interface AdminStatus {
  resolved: boolean;
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
  // Admin status: resolved lazily (false until resolveAdmin() completes).
  isAdmin: boolean;
  adminResolved: boolean;
  resolveAdmin: () => void;
  login: (token: string, user?: User) => void;
  logout: () => void;
  // Re-load viewer status without a token change (e.g. after creating a profile).
  refreshViewer: () => Promise<void>;
}

const EMPTY_VIEWER: ViewerStatus = { hasProfile: false, isVc: false };
const EMPTY_ADMIN: AdminStatus = { resolved: false, isAdmin: false };

// Probe the two cold-load status endpoints. Each failure degrades to "no
// access" so a logged-out/expired token never grants anything.
async function loadViewer(): Promise<ViewerStatus> {
  const [profileRes, vcRes] = await Promise.allSettled([
    api.get<FounderProfile | null>('/api/profile/me'),
    api.get<VCMe>('/api/vc/me'),
  ]);
  // A 401 on the profile probe means the stored token is invalid/expired — as
  // opposed to a 404/no-profile, a non-VC 403, or a transient network/5xx error,
  // none of which should log the user out. Re-throw it so the caller can clear
  // the dead token instead of leaving the user "authenticated" with no profile
  // (which would bounce them to /create-profile on every reload).
  if (
    profileRes.status === 'rejected' &&
    profileRes.reason instanceof ApiError &&
    profileRes.reason.status === 401
  ) {
    throw profileRes.reason;
  }
  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
  const vc = vcRes.status === 'fulfilled' ? vcRes.value : null;
  return { hasProfile: Boolean(profile), isVc: Boolean(vc?.approved) };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);
  const [viewer, setViewer] = useState<ViewerStatus>(EMPTY_VIEWER);
  const [viewerLoading, setViewerLoading] = useState<boolean>(() => Boolean(getToken()));
  const [admin, setAdmin] = useState<AdminStatus>(EMPTY_ADMIN);
  const adminRef = useRef({ probing: false, resolved: false });

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

  // Resolve admin status lazily (once per session). Only callers that actually
  // need it (admin routes) invoke this, so non-admins never hit /api/admin/me.
  const resolveAdmin = useCallback(() => {
    if (!getToken() || adminRef.current.probing || adminRef.current.resolved) return;
    adminRef.current.probing = true;
    api
      .get('/api/admin/me')
      .then(() => {
        adminRef.current.resolved = true;
        setAdmin({ resolved: true, isAdmin: true });
      })
      .catch(() => {
        adminRef.current.resolved = true;
        setAdmin({ resolved: true, isAdmin: false });
      })
      .finally(() => {
        adminRef.current.probing = false;
      });
  }, []);

  // Reload viewer status (and reset lazily-resolved admin status) whenever the
  // token changes (login/logout/refresh).
  useEffect(() => {
    let active = true;
    setAdmin(EMPTY_ADMIN);
    adminRef.current = { probing: false, resolved: false };
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
      .catch((err) => {
        if (!active) return;
        // The stored token was rejected (401): clear it and fall through to the
        // normal logged-out state. Setting the token to null re-runs this effect,
        // which short-circuits on the `!token` branch above — no refetch, no loop.
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          setTokenState(null);
        }
        setViewer(EMPTY_VIEWER);
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
      isAdmin: admin.isAdmin,
      adminResolved: admin.resolved,
      resolveAdmin,
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
        setAdmin(EMPTY_ADMIN);
      },
      refreshViewer,
    }),
    [token, user, viewer, viewerLoading, admin, resolveAdmin, refreshViewer]
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
