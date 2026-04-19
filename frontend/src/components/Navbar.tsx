import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from './Logo'
import { thumb, btnSmGhost, btnPrimary } from '../lib/ui'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `text-skin-text font-medium px-2.5 py-1.5 rounded-skin hover:bg-skin-surface-2 hover:no-underline text-[15px] whitespace-nowrap${
      isActive ? ' bg-skin-surface-2 text-skin-accent font-semibold' : ''
    }`

  const mobileLinkBase = 'block px-3 py-2 rounded-skin text-sm text-skin-text hover:bg-skin-surface-2 hover:no-underline'
  const mobileNavLink = ({ isActive }: { isActive: boolean }) =>
    `${mobileLinkBase}${isActive ? ' bg-skin-surface-2 text-skin-accent font-semibold' : ''}`

  return (
    <nav className="sticky top-0 z-10 bg-skin-surface border-b border-skin-border shadow-skin">
      <div className="max-w-[1100px] mx-auto flex items-center gap-2 sm:gap-4 px-4 sm:px-5 py-2.5 relative">
        <Link to="/" className="hover:no-underline shrink-0">
          <Logo />
        </Link>

        <div className="hidden sm:flex gap-1.5 sm:gap-3.5 flex-1 min-w-0">
          <NavLink to="/" end className={navLink}>Home</NavLink>
          <NavLink to="/search" className={navLink}>Search</NavLink>
          {user && <NavLink to="/practice" className={navLink}>Practice</NavLink>}
          {user && <NavLink to="/rooms" className={navLink}>Rooms</NavLink>}
          {user && <NavLink to="/profile" className={navLink}>Profile</NavLink>}
          <NavLink to="/settings" className={navLink}>Settings</NavLink>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-skin border border-skin-border bg-skin-surface-2 text-skin-text"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {user ? (
            <>
              <Link to="/profile" className="flex items-center gap-2 hover:no-underline">
                {user.picture && <img className={thumb} src={user.picture} alt="" />}
                <span className="hidden lg:inline text-skin-muted text-[13px]">{user.name}</span>
              </Link>
              <button className={`${btnSmGhost} hidden sm:inline-flex`} onClick={() => { logout(); navigate('/') }}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className={`${btnPrimary} hidden sm:inline-flex`}>Sign in</Link>
          )}
        </div>

        {menuOpen && (
          <div className="sm:hidden absolute top-full right-4 mt-2 w-[min(280px,calc(100vw-2rem))] bg-skin-surface border border-skin-border rounded-skin shadow-skin p-2">
            <div className="flex flex-col gap-1">
              <NavLink to="/" end className={mobileNavLink}>Home</NavLink>
              <NavLink to="/search" className={mobileNavLink}>Search</NavLink>
              {user && <NavLink to="/practice" className={mobileNavLink}>Practice</NavLink>}
              {user && <NavLink to="/rooms" className={mobileNavLink}>Rooms</NavLink>}
              {user && <NavLink to="/profile" className={mobileNavLink}>Profile</NavLink>}
              <NavLink to="/settings" className={mobileNavLink}>Settings</NavLink>
              <div className="border-t border-skin-border my-1" />
              {user ? (
                <button
                  className="text-left px-3 py-2 rounded-skin text-sm text-skin-danger hover:bg-skin-surface-2"
                  onClick={() => { setMenuOpen(false); logout(); navigate('/') }}
                >
                  Sign out
                </button>
              ) : (
                <Link to="/login" className={`${mobileLinkBase} font-semibold`}>Sign in</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
