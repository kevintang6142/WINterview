import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeCtxValue {
  theme: Theme
  toggle: () => void
}

const ThemeCtx = createContext<ThemeCtxValue>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('winterview.theme') as Theme) || 'light'
  })

  useEffect(() => {
    // Use Tailwind's class-based dark mode
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('winterview.theme', theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
