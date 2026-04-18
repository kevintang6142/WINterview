import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from './api'
import { User } from './types'

interface AuthCtxValue {
  user: User | null
  login: (credential: string) => Promise<User>
  logout: () => void
  ready: boolean
}

const AuthCtx = createContext<AuthCtxValue>({
  user: null,
  login: async () => { throw new Error('not ready') },
  logout: () => {},
  ready: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
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

  const login = async (credential: string): Promise<User> => {
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
