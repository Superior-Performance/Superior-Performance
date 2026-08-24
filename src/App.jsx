import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'

// Athlete pages
import AthleteLayout from './pages/athlete/AthleteLayout'
import SchedulePage   from './pages/athlete/SchedulePage'
import ChatPage       from './pages/athlete/ChatPage'
import ProgressPage   from './pages/athlete/ProgressPage'
import RapsodoPage    from './pages/athlete/RapsodoPage'
import AccountPage    from './pages/athlete/AccountPage'

// Admin pages
import AdminLayout       from './pages/admin/AdminLayout'
import AdminAthletesPage from './pages/admin/AdminAthletesPage'
import AdminProgramsPage from './pages/admin/AdminProgramsPage'
import AdminChatPage     from './pages/admin/AdminChatPage'
import AdminAthleteDetail from './pages/admin/AdminAthleteDetail'
import AdminSettingsPage  from './pages/admin/AdminSettingsPage'

function RequireAuth({ children, role }) {
  const { currentUser, userProfile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!currentUser || !userProfile) return <Navigate to="/login" replace />
  if (role && userProfile.role !== role) {
    return <Navigate to={userProfile.role === 'admin' ? '/admin' : '/athlete'} replace />
  }
  return children
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sp-ink-900">
      <div className="text-center text-white">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium opacity-70">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  const { currentUser, userProfile, loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      {/* Landing */}
      <Route path="/" element={<LandingPage />} />

      {/* Login */}
      <Route
        path="/login"
        element={
          currentUser && userProfile
            ? <Navigate to={userProfile.role === 'admin' ? '/admin' : '/athlete'} replace />
            : <LoginPage />
        }
      />

      {/* Athlete routes */}
      <Route path="/athlete" element={
        <RequireAuth role="athlete"><AthleteLayout /></RequireAuth>
      }>
        <Route index element={<Navigate to="schedule" replace />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="chat"     element={<ChatPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="rapsodo"  element={<RapsodoPage />} />
        <Route path="account"  element={<AccountPage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={
        <RequireAuth role="admin"><AdminLayout /></RequireAuth>
      }>
        <Route index element={<Navigate to="athletes" replace />} />
        <Route path="athletes"          element={<AdminAthletesPage />} />
        <Route path="athletes/:uid"     element={<AdminAthleteDetail />} />
        <Route path="programs"          element={<AdminProgramsPage />} />
        <Route path="chat"              element={<AdminChatPage />} />
        <Route path="chat/:athleteUid"  element={<AdminChatPage />} />
        <Route path="settings"          element={<AdminSettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
