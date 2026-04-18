import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'winterview.settings'

const DEFAULTS = {
  autoRecord: true,          // auto-start recording when TTS finishes
  autoAdvance: true,         // auto-advance to next question when recording stops
  autoAdvanceSeconds: 5,     // countdown before advancing (auto-advance only)
  maxResponseSeconds: 180,   // hard cap on answer length — auto-stops recording
}

const SettingsCtx = createContext({ settings: DEFAULTS, update: () => {} })

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
    } catch {
      return DEFAULTS
    }
  })

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings))
  }, [settings])

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }))

  return (
    <SettingsCtx.Provider value={{ settings, update }}>
      {children}
    </SettingsCtx.Provider>
  )
}

export const useSettings = () => useContext(SettingsCtx)
