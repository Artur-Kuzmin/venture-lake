import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/authContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import CreateProfilePage from './pages/CreateProfilePage';
import ProfilePage from './pages/ProfilePage';
import LobbyPage from './pages/LobbyPage';
import TeamPage from './pages/TeamPage';
import VCPage from './pages/VCPage';
import ShowcasePage from './pages/ShowcasePage';
import AdminPage from './pages/AdminPage';

function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="app-nav">
      <Link to="/showcase">Showcase</Link>
      <Link to="/lobby">Lobby</Link>
      <Link to="/profile">Profile</Link>
      <Link to="/vc">VC</Link>
      <Link to="/admin">Admin</Link>
      {isAuthenticated ? (
        <button type="button" onClick={handleLogout} className="link-button">
          Log out
        </button>
      ) : (
        <>
          <Link to="/login">Login</Link>
          <Link to="/signup">Sign up</Link>
        </>
      )}
    </nav>
  );
}

// App shell + route table. /create-profile requires auth; /profile requires
// auth + a founder profile. Other routes are wired up in later phases.
export default function App() {
  return (
    <div className="app-shell">
      <NavBar />

      <Routes>
        <Route path="/" element={<Navigate to="/showcase" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
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
            <ProtectedRoute>
              <TeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vc"
          element={
            <ProtectedRoute>
              <VCPage />
            </ProtectedRoute>
          }
        />
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/showcase" replace />} />
      </Routes>
    </div>
  );
}
