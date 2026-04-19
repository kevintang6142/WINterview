import { useEffect, useState } from 'react'
import { useSettings } from '../settings'
import { useTheme } from '../theme'
import { useAuth } from '../auth'
import { api } from '../api'
import { main, card, stack, muted } from '../lib/ui'

interface Voice { id: string; name: string }

interface ToggleProps {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string
}

function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="flex items-start sm:items-center gap-3.5 p-3 border border-skin-border rounded-skin bg-skin-surface-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto' }} />
      <div className="flex-1">
        <div className="font-semibold">{label}</div>
        {hint && <div className={muted}>{hint}</div>}
      </div>
    </label>
  )
}

export default function Settings() {
  const { settings, update } = useSettings()
  const { theme, toggle } = useTheme()
  const { user } = useAuth()
  const [voices, setVoices] = useState<Voice[]>([])

  useEffect(() => {
    api.get('/voice/voices').then(setVoices).catch(() => setVoices([]))
  }, [])

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <h3 className="mt-0 mb-3">Appearance</h3>
          <Toggle checked={theme === 'dark'} onChange={() => toggle()} label="Dark mode" hint="Toggle between dark and light themes." />
        </div>

        {user && (
          <div className={card}>
            <h3 className="mt-0 mb-3">Practice session behavior</h3>
            <div className={stack}>
            <Toggle
              checked={settings.typeMode}
              onChange={(v) => update({ typeMode: v })}
              label="Typing mode"
              hint="Replaces the microphone with a text box. WPM and pacing chart are disabled. Filler words are still detected."
            />

            {/* TTS interviewer */}
            <div className="flex gap-3.5 items-start p-3 border border-skin-border rounded-skin bg-skin-surface-2">
              <input
                type="checkbox"
                checked={settings.ttsEnabled}
                onChange={(e) => update({ ttsEnabled: e.target.checked })}
                style={{ width: 'auto', marginTop: 4 }}
              />
              <div className="flex-1">
                <div className="font-semibold">AI interviewer voice</div>
                <div className={muted}>Read each question aloud using a synthesized voice before you answer.</div>
                <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                  <div className={`flex items-center flex-wrap gap-2 ${settings.ttsEnabled ? '' : 'opacity-40'}`}>
                    <label className={muted}>Voice:</label>
                    <select
                      value={settings.ttsVoiceId}
                      disabled={!settings.ttsEnabled}
                      onChange={(e) => update({ ttsVoiceId: e.target.value })}
                      style={{ width: 'auto' }}
                    >
                      {voices.length === 0 && (
                        <option value={settings.ttsVoiceId}>Loading…</option>
                      )}
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={`flex items-center flex-wrap gap-2 ${!settings.ttsEnabled ? '' : 'opacity-40'}`}>
                    <label className={muted}>Countdown:</label>
                    <input
                      type="number" min={0} max={30}
                      value={settings.preRecordDelay}
                      disabled={settings.ttsEnabled}
                      onChange={(e) => update({ preRecordDelay: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
                      style={{ width: 72 }}
                    />
                    <span className={muted}>sec</span>
                  </div>
                </div>
              </div>
            </div>

            {!settings.typeMode && (
              <>
                <Toggle
                  checked={settings.autoRecord}
                  onChange={(v) => update({ autoRecord: v })}
                  label="Auto-start recording after the question is read"
                  hint="When off, you'll press a button to start recording."
                />

                <div className="p-3 border border-skin-border rounded-skin bg-skin-surface-2">
                  <div className="font-semibold">Maximum response time</div>
                  <div className={muted}>Recording auto-stops after this many seconds. Most real behavioral answers are 90–180 seconds.</div>
                  <div className="flex items-center flex-wrap gap-2 mt-2.5">
                    <input type="number" min={30} max={600} step={15} value={settings.maxResponseSeconds}
                      onChange={(e) => update({ maxResponseSeconds: Math.max(30, Math.min(600, Number(e.target.value) || 180)) })}
                      style={{ width: 90 }} />
                    <span className={muted}>
                      seconds ({Math.floor(settings.maxResponseSeconds / 60)}:{String(settings.maxResponseSeconds % 60).padStart(2, '0')})
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3.5 items-start p-3 border border-skin-border rounded-skin bg-skin-surface-2">
              <input type="checkbox" checked={settings.autoAdvance} onChange={(e) => update({ autoAdvance: e.target.checked })} style={{ width: 'auto', marginTop: 4 }} />
              <div className="flex-1">
                <div className="font-semibold">Auto-advance to next question</div>
                <div className={muted}>When off, you'll review your answer and press Next.</div>
                <div className={`flex items-center flex-wrap gap-2 mt-2.5 ${settings.autoAdvance ? '' : 'opacity-40'}`}>
                  <label htmlFor="advance-secs" className={muted}>Countdown between questions:</label>
                  <input id="advance-secs" type="number" min={0} max={30} value={settings.autoAdvanceSeconds}
                    disabled={!settings.autoAdvance}
                    onChange={(e) => update({ autoAdvanceSeconds: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
                    style={{ width: 72 }} />
                  <span className={muted}>seconds</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
