import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { api } from './api'
import { useAuth } from './auth'

const LS_KEY = 'winterview.mastery'

export type MasteryState = 'none' | 'in-progress' | 'mastered'
type MasteryMap = Record<string, MasteryState>

interface MasteryCtxValue {
  getState: (id: string) => MasteryState
  setState: (id: string, state: MasteryState) => void
  masteryMap: MasteryMap
}

const MasteryCtx = createContext<MasteryCtxValue>({
  getState: () => 'none',
  setState: () => {},
  masteryMap: {},
})

function loadLocalMastery(): MasteryMap {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const m: MasteryMap = {}
      for (const id of parsed) m[id] = 'mastered'
      return m
    }
    return parsed as MasteryMap
  } catch { return {} }
}

export function MasteryProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const [masteryMap, setMasteryMap] = useState<MasteryMap>(loadLocalMastery)
  // track whether we're in server-backed mode
  const serverMode = useRef(false)

  // When auth resolves, load mastery from appropriate source
  useEffect(() => {
    if (!ready) return
    if (user) {
      serverMode.current = true
      api.get('/users/me/mastery')
        .then((r: { mastery: MasteryMap }) => setMasteryMap(r.mastery ?? {}))
        .catch(() => {})
    } else {
      serverMode.current = false
      setMasteryMap(loadLocalMastery())
    }
  }, [user, ready])

  // Persist to localStorage when not server-backed
  useEffect(() => {
    if (!serverMode.current) {
      localStorage.setItem(LS_KEY, JSON.stringify(masteryMap))
    }
  }, [masteryMap])

  const getState = (id: string): MasteryState => masteryMap[id] ?? 'none'

  const setState = (id: string, state: MasteryState) => {
    setMasteryMap((prev) => {
      if (state === 'none') {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: state }
    })
    if (serverMode.current) {
      api.post('/users/me/mastery', { question_id: id, state }).catch(() => {})
    }
  }

  return (
    <MasteryCtx.Provider value={{ getState, setState, masteryMap }}>
      {children}
    </MasteryCtx.Provider>
  )
}

export const useMastery = () => useContext(MasteryCtx)
