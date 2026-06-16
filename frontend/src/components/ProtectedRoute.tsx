import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { Loading } from './Loading';

// Guards routes against the authenticated viewer status (single source of truth
// in authContext):
//  - unauthenticated            -> /login
//  - requireProfile, no profile -> /create-profile
//  - requireAdmin, not admin    -> /lobby
//  - requireVc, not approved VC -> /lobby
// While viewer status is still loading, a placeholder is shown so we never
// redirect on stale/empty status. Admin status is resolved lazily here (only
// when an admin route mounts) so non-admins never probe /api/admin/me.
export function ProtectedRoute({
  children,
  requireProfile = false,
  requireAdmin = false,
  requireVc = false,
}: {
  children: ReactNode;
  requireProfile?: boolean;
  requireAdmin?: boolean;
  requireVc?: boolean;
}) {
  const { isAuthenticated, viewerLoading, hasProfile, isAdmin, adminResolved, resolveAdmin, isVc } =
    useAuth();

  useEffect(() => {
    if (requireAdmin && isAuthenticated) resolveAdmin();
  }, [requireAdmin, isAuthenticated, resolveAdmin]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (viewerLoading) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  if (requireProfile && !hasProfile) {
    return <Navigate to="/create-profile" replace />;
  }
  if (requireAdmin) {
    if (!adminResolved) {
      return (
        <div className="page">
          <Loading />
        </div>
      );
    }
    if (!isAdmin) {
      return <Navigate to="/lobby" replace />;
    }
  }
  if (requireVc && !isVc) {
    return <Navigate to="/lobby" replace />;
  }
  return <>{children}</>;
}

export default ProtectedRoute;
