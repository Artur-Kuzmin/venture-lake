import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/authContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import HowItWorksPage from './pages/HowItWorksPage';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import CreateProfilePage from './pages/CreateProfilePage';
import ProfilePage from './pages/ProfilePage';
import LobbyPage from './pages/LobbyPage';
import TeamPage from './pages/TeamPage';
import VCPage from './pages/VCPage';
import ShowcasePage from './pages/ShowcasePage';
import AdminPage from './pages/AdminPage';

function PageLoading() {
  return (
    <div className="page">
      <p className="placeholder">Loading…</p>
    </div>
  );
}

// Where an authenticated user belongs by default.
function homeFor(hasProfile: boolean): string {
  return hasProfile ? '/lobby' : '/create-profile';
}

function NavBar() {
  const { isAuthenticated, isVc, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          VentureLake
        </Link>
        <nav className="app-nav">
          {isAuthenticated ? (
            <>
              <Link className="nav-link" to="/lobby">
                Lobby
              </Link>
              <Link className="nav-link" to="/profile">
                Profile
              </Link>
              <Link className="nav-link" to="/showcase">
                Showcase
              </Link>
              {isVc && (
                <Link className="nav-link" to="/vc">
                  VC Mode
                </Link>
              )}
              {isAdmin && (
                <Link className="nav-link" to="/admin">
                  Admin
                </Link>
              )}
              <button type="button" onClick={handleLogout} className="btn btn--ghost btn--sm">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="nav-link" to="/">
                Home
              </Link>
              <Link className="nav-link" to="/how-it-works">
                How it works
              </Link>
              <Link className="nav-link" to="/showcase">
                Showcase
              </Link>
              <Link className="nav-link" to="/login">
                Log in
              </Link>
              <Link className="btn btn--sm" to="/signup">
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// Root "/": landing page for guests; otherwise route to the user's default page.
function RootRoute() {
  const { isAuthenticated, viewerLoading, hasProfile } = useAuth();
  if (!isAuthenticated) return <HomePage />;
  if (viewerLoading) return <PageLoading />;
  return <Navigate to={homeFor(hasProfile)} replace />;
}

// Login/signup: redirect already-authenticated users to their default page.
function AuthRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, viewerLoading, hasProfile } = useAuth();
  if (!isAuthenticated) return <>{children}</>;
  if (viewerLoading) return <PageLoading />;
  return <Navigate to={homeFor(hasProfile)} replace />;
}

// Unknown paths: guests -> Home; authenticated -> their default page (never /showcase).
function WildcardRoute() {
  const { isAuthenticated, viewerLoading, hasProfile } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (viewerLoading) return <PageLoading />;
  return <Navigate to={homeFor(hasProfile)} replace />;
}

// App shell + route table. Routing and nav visibility are driven by the
// authenticated viewer status in authContext.
export default function App() {
  return (
    <div className="app-shell">
      <NavBar />

      <main className="app-main">
        <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route
          path="/login"
          element={
            <AuthRoute>
              <LoginPage />
            </AuthRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <AuthRoute>
              <SignupPage />
            </AuthRoute>
          }
        />
        <Route
          path="/create-profile"
          element={
            <ProtectedRoute>
              <CreateProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute requireProfile>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lobby"
          element={
            <ProtectedRoute requireProfile>
              <LobbyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team/:teamId"
          element={
            <ProtectedRoute requireProfile>
              <TeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vc"
          element={
            <ProtectedRoute requireProfile requireVc>
              <VCPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireProfile requireAdmin>
              <AdminPage />
            </ProtectedRoute>
          }
        />
          <Route path="*" element={<WildcardRoute />} />
        </Routes>
      </main>
    </div>
  );
}
