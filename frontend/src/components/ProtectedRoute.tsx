import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { api } from '../lib/apiClient';
import type { FounderProfile } from '../types';

// Guards routes:
//  - unauthenticated  -> redirect to /login
//  - requireProfile && no founder profile -> redirect to /create-profile
// Profile presence is checked against the backend (source of truth).
export function ProtectedRoute({
  children,
  requireProfile = false,
}: {
  children: ReactNode;
  requireProfile?: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [profileStatus, setProfileStatus] = useState<'loading' | 'present' | 'missing'>('loading');

  useEffect(() => {
    if (!isAuthenticated || !requireProfile) return;
    let active = true;
    setProfileStatus('loading');
    api
      .get<FounderProfile | null>('/api/profile/me')
      .then((profile) => {
        if (active) setProfileStatus(profile ? 'present' : 'missing');
      })
      .catch(() => {
        if (active) setProfileStatus('missing');
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, requireProfile, location.pathname]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!requireProfile) {
    return <>{children}</>;
  }

  if (profileStatus === 'loading') {
    return (
      <div className="page">
        <p className="placeholder">Loading…</p>
      </div>
    );
  }

  if (profileStatus === 'missing') {
    return <Navigate to="/create-profile" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
