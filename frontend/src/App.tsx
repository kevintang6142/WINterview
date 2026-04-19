import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import { useAuth } from './auth'
import Home from './pages/Home'
import Login from './pages/Login'
import Search from './pages/Search'
import QuestionDetail from './pages/QuestionDetail'
import SessionSetup from './pages/SessionSetup'
import SessionRun from './pages/SessionRun'
import SessionResult from './pages/SessionResult'
import Profile from './pages/Profile'
import ResponseDetail from './pages/ResponseDetail'
import SettingsPage from './pages/Settings'
import Rooms from './pages/Rooms'
import Room from './pages/Room'
import { ReactNode } from 'react'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="max-w-[1100px] mx-auto px-4 sm:px-5 py-6"><div className="bg-skin-surface border border-skin-border rounded-skin p-4 shadow-skin">Loading…</div></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <div className="grid grid-rows-[auto_1fr] min-h-full">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/search" element={<Search />} />
        <Route path="/question/:id" element={<QuestionDetail />} />
        <Route path="/response/:id" element={<ResponseDetail />} />
        <Route path="/practice" element={<RequireAuth><SessionSetup /></RequireAuth>} />
        <Route path="/session/:id" element={<RequireAuth><SessionRun /></RequireAuth>} />
        <Route path="/session/:id/result" element={<RequireAuth><SessionResult /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/rooms" element={<RequireAuth><Rooms /></RequireAuth>} />
        <Route path="/rooms/:code" element={<RequireAuth><Room /></RequireAuth>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}
