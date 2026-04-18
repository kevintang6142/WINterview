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

function RequireAuth({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="main"><div className="card">Loading…</div></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <div className="app">
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}
