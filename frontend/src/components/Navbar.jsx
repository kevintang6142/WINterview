import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from './Logo'

export default function Navbar() {
  const { user, logout } = useAuth()
  const nav = useNavigate()

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Logo />
        </Link>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/search">Search</Link>
          {user && <Link to="/practice">Practice</Link>}
          {user && <Link to="/profile">Profile</Link>}
          <Link to="/settings">Settings</Link>
        </div>
        <div className="nav-right">
          {user ? (
            <>
              {user.picture && <img className="thumb" src={user.picture} alt="" />}
              <span className="muted">{user.name}</span>
              <button className="ghost small" onClick={() => { logout(); nav('/') }}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
