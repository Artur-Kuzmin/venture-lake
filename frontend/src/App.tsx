import { Link, Navigate, Route, Routes } from 'react-router-dom';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import CreateProfilePage from './pages/CreateProfilePage';
import ProfilePage from './pages/ProfilePage';
import LobbyPage from './pages/LobbyPage';
import TeamPage from './pages/TeamPage';
import VCPage from './pages/VCPage';
import ShowcasePage from './pages/ShowcasePage';
import AdminPage from './pages/AdminPage';

// App shell + route table. Page stubs are minimal but valid; protected-route
// guards and real navigation are wired up in later phases.
export default function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/showcase">Showcase</Link>
        <Link to="/lobby">Lobby</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/vc">VC</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/login">Login</Link>
        <Link to="/signup">Sign up</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/showcase" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/create-profile" element={<CreateProfilePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/team/:teamId" element={<TeamPage />} />
        <Route path="/vc" element={<VCPage />} />
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/showcase" replace />} />
      </Routes>
    </div>
  );
}
