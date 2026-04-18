import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

const KEY = 'winterview.settings'

export interface Settings {
  autoRecord: boolean
  autoAdvance: boolean
  autoAdvanceSeconds: number
  maxResponseSeconds: number
  typeMode: boolean
  ttsEnabled: boolean
  ttsVoiceId: string
  preRecordDelay: number
}

const DEFAULTS: Settings = {
  autoRecord: true,
  autoAdvance: true,
  autoAdvanceSeconds: 5,
  maxResponseSeconds: 180,
  typeMode: false,
  ttsEnabled: true,
  ttsVoiceId: '21m00Tcm4TlvDq8ikWAM',
  preRecordDelay: 5,
}

interface SettingsCtxValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsCtx = createContext<SettingsCtxValue>({ settings: DEFAULTS, update: () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
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

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }))

  return (
    <SettingsCtx.Provider value={{ settings, update }}>
      {children}
    </SettingsCtx.Provider>
  )
}

export const useSettings = () => useContext(SettingsCtx)
