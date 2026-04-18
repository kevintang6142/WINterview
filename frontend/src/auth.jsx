import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthCtx = createContext({ user: null, login: () => {}, logout: () => {} })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('winterview.token')
    if (!token) {
      setReady(true)
      return
    }
    api.get('/auth/me')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('winterview.token')
      })
      .finally(() => setReady(true))
  }, [])

  const login = async (credential) => {
    const { token, user } = await api.post('/auth/google', { credential })
    localStorage.setItem('winterview.token', token)
    setUser(user)
    return user
  }

  const logout = () => {
    localStorage.removeItem('winterview.token')
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ user, login, logout, ready }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
