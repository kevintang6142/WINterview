import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from './Logo'
import { thumb, btnSmGhost, btnPrimary } from '../lib/ui'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `text-skin-text font-medium px-2.5 py-1.5 rounded-skin hover:bg-skin-surface-2 hover:no-underline text-[15px] whitespace-nowrap${
      isActive ? ' bg-skin-surface-2 text-skin-accent font-semibold' : ''
    }`

  return (
    <nav className="sticky top-0 z-10 bg-skin-surface border-b border-skin-border shadow-skin">
      <div className="max-w-[1100px] mx-auto flex flex-wrap items-center gap-2 sm:gap-4 px-4 sm:px-5 py-2.5 min-w-0">
        <Link to="/" className="hover:no-underline shrink-0">
          <Logo />
        </Link>
        <div className="order-3 flex gap-1.5 sm:gap-3.5 basis-full min-w-0 overflow-x-auto pb-1 -mb-1 sm:order-none sm:basis-auto sm:flex-1 sm:overflow-visible">
          <NavLink to="/" end className={navLink}>Home</NavLink>
          <NavLink to="/search" className={navLink}>Search</NavLink>
          {user && <NavLink to="/practice" className={navLink}>Practice</NavLink>}
          {user && <NavLink to="/rooms" className={navLink}>Rooms</NavLink>}
          {user && <NavLink to="/profile" className={navLink}>Profile</NavLink>}
          <NavLink to="/settings" className={navLink}>Settings</NavLink>
        </div>
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {user ? (
            <>
              <Link to="/profile" className="flex items-center gap-2 hover:no-underline min-w-0">
                {user.picture && <img className={thumb} src={user.picture} alt="" />}
                <span className="hidden md:inline text-skin-muted text-[13px]">{user.name}</span>
              </Link>
              <button className={`${btnSmGhost} shrink-0`} onClick={() => { logout(); navigate('/') }}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className={`${btnPrimary} shrink-0`}>Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
