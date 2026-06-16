import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/authContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Loading';

// Route-level code splitting: each page is its own lazy chunk, loaded only when
// actually rendered. Guards (ProtectedRoute/AuthRoute/redirects) stay eager and
// run outside the lazy boundary, so unauthenticated users never trigger the
// authenticated chunks.
const HomePage = lazy(() => import('./pages/HomePage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CreateProfilePage = lazy(() => import('./pages/CreateProfilePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const VCPage = lazy(() => import('./pages/VCPage'));
const ShowcasePage = lazy(() => import('./pages/ShowcasePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function PageLoading() {
  return (
    <div className="page">
      <Loading />
    </div>
  );
}

// Active-route styling for nav links (React Router adds isActive).
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link nav-link--active' : 'nav-link';

// Where an authenticated user belongs by default.
function homeFor(hasProfile: boolean): string {
  return hasProfile ? '/lobby' : '/create-profile';
}

// Top navigation for logged-out visitors (landing pages, login, signup).
function GuestHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          VentureLake
        </Link>
        <nav className="app-nav">
          <NavLink className={navLinkClass} to="/" end>
            Home
          </NavLink>
          <NavLink className={navLinkClass} to="/how-it-works">
            How it works
          </NavLink>
          <NavLink className={navLinkClass} to="/showcase">
            Showcase
          </NavLink>
          <NavLink className={navLinkClass} to="/login">
            Log in
          </NavLink>
          <Link className="btn btn--sm" to="/signup">
            Get started
          </Link>
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

// The full route table. Identical for both chromes — only the surrounding shell
// (guest top-nav vs authenticated sidebar) differs.
function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
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
    </Suspense>
  );
}

// App shell selection: authenticated users get the persistent sidebar
// workspace; logged-out visitors keep the landing-page top navigation. The
// route table and all guards are identical across both.
export default function App() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <AppShell>
        <AppRoutes />
      </AppShell>
    );
  }

  return (
    <div className="app-shell">
      <GuestHeader />
      <main className="app-main">
        <AppRoutes />
      </main>
    </div>
  );
}
