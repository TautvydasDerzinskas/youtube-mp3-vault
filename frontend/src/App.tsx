import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import AppLayout from './components/Layout/AppLayout';
import PlaylistsPage from './pages/PlaylistsPage';
import PlaylistDetailPage from './pages/PlaylistDetailPage';
import TrackDetailPage from './pages/TrackDetailPage';
import ProfilePage from './pages/ProfilePage';
import ChangeEmailPage from './pages/ProfilePage/ChangeEmailPage';
import ChangePasswordPage from './pages/ProfilePage/ChangePasswordPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import TriggersPage from './pages/TriggersPage';
import LogsPage from './pages/LogsPage';
import DownloadsPage from './pages/DownloadsPage';

function LoadingScreen() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      <CircularProgress color="primary" />
    </Box>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return !user ? <>{children}</> : <Navigate to="/playlists" replace />;
}

// Nested inside the already-authenticated "/" PrivateRoute subtree, so it only
// needs to gate on the admin flag, not re-check login state.
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.isAdmin ? <>{children}</> : <Navigate to="/playlists" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/playlists" replace />} />
          <Route path="playlists" element={<PlaylistsPage />} />
          <Route path="playlists/:id" element={<PlaylistDetailPage />} />
          <Route path="playlists/:id/:trackId" element={<TrackDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/email" element={<ChangeEmailPage />} />
          <Route path="profile/password" element={<ChangePasswordPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="admin" element={<AdminRoute><Outlet /></AdminRoute>}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="triggers" element={<TriggersPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
