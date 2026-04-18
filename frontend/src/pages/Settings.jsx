import { useSettings } from '../settings'
import { useTheme } from '../theme'

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label
      className="row"
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface-2)',
        cursor: 'pointer',
        gap: 14,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 'auto' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div className="muted" style={{ fontSize: 13 }}>{hint}</div>}
      </div>
    </label>
  )
}

export default function Settings() {
  const { settings, update } = useSettings()
  const { theme, toggle } = useTheme()

  return (
    <div className="main">
      <div className="stack">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Appearance</h3>
          <Toggle
            checked={theme === 'dark'}
            onChange={() => toggle()}
            label="Dark mode"
            hint="Toggle between dark and light themes."
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Practice session behavior</h3>
          <div className="stack">
            <Toggle
              checked={settings.autoRecord}
              onChange={(v) => update({ autoRecord: v })}
              label="Auto-start recording after the question is read"
              hint="When off, you'll press a button to start recording."
            />

            <div
              style={{
                padding: '12px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--surface-2)',
              }}
            >
              <div style={{ fontWeight: 600 }}>Maximum response time</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Recording auto-stops after this many seconds. Most real
                behavioral answers are 90–180 seconds.
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <input
                  type="number"
                  min={30}
                  max={600}
                  step={15}
                  value={settings.maxResponseSeconds}
                  onChange={(e) =>
                    update({
                      maxResponseSeconds: Math.max(
                        30,
                        Math.min(600, Number(e.target.value) || 180),
                      ),
                    })
                  }
                  style={{ width: 90 }}
                />
                <span className="muted">
                  seconds ({Math.floor(settings.maxResponseSeconds / 60)}:
                  {String(settings.maxResponseSeconds % 60).padStart(2, '0')})
                </span>
              </div>
            </div>
            <div
              className="row"
              style={{
                padding: '12px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--surface-2)',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <input
                type="checkbox"
                checked={settings.autoAdvance}
                onChange={(e) => update({ autoAdvance: e.target.checked })}
                style={{ width: 'auto', marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  Auto-advance to next question when you stop recording
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  When off, you'll review your transcript and press Next.
                </div>
                <div
                  className="row"
                  style={{
                    marginTop: 10,
                    gap: 8,
                    opacity: settings.autoAdvance ? 1 : 0.4,
                  }}
                >
                  <label htmlFor="advance-secs" className="muted">
                    Countdown between questions:
                  </label>
                  <input
                    id="advance-secs"
                    type="number"
                    min={0}
                    max={30}
                    value={settings.autoAdvanceSeconds}
                    disabled={!settings.autoAdvance}
                    onChange={(e) =>
                      update({
                        autoAdvanceSeconds: Math.max(
                          0,
                          Math.min(30, Number(e.target.value) || 0),
                        ),
                      })
                    }
                    style={{ width: 72 }}
                  />
                  <span className="muted">seconds</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
