import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'sb-link sb-link--active' : 'sb-link';

// Minimal inline icons (Linear/Vercel-style line icons), sized via CSS.
const icons: Record<string, ReactNode> = {
  lobby: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  ),
  showcase: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  vc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M8 17v-5" />
      <path d="M13 17V8" />
      <path d="M18 17v-8" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
};

// Persistent left sidebar for the authenticated app shell. Role-gated links
// mirror the existing permissions (VC Mode for approved VCs, Admin for admins).
export function Sidebar() {
  const { isVc, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <aside className="app-sidebar">
      <div className="sb-brand">
        <span className="brand__mark" aria-hidden="true" />
        <span className="sb-brand__name">VentureLake</span>
      </div>

      <nav className="sb-nav">
        <span className="sb-section-label">Workspace</span>
        <NavLink className={linkClass} to="/lobby">
          {icons.lobby}
          Lobby
        </NavLink>
        <NavLink className={linkClass} to="/showcase">
          {icons.showcase}
          Showcase
        </NavLink>
        {isVc && (
          <NavLink className={linkClass} to="/vc">
            {icons.vc}
            VC Mode
          </NavLink>
        )}
        {isAdmin && (
          <NavLink className={linkClass} to="/admin">
            {icons.admin}
            Admin
          </NavLink>
        )}
      </nav>

      <div className="sb-foot">
        <NavLink className={linkClass} to="/profile">
          {icons.profile}
          Profile
        </NavLink>
        <button type="button" className="sb-link sb-logout" onClick={handleLogout}>
          {icons.logout}
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
