import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import CompanyAutocomplete from '../components/CompanyAutocomplete'

export default function SessionSetup() {
  const nav = useNavigate()
  const { state } = useLocation()
  const [mode, setMode] = useState(state?.preselect ? 'selected' : 'generated')
  const [count, setCount] = useState(3)
  const [company, setCompany] = useState('')
  const [questions, setQuestions] = useState([])
  const [selected, setSelected] = useState(state?.preselect ? [state.preselect] : [])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (mode === 'selected' && questions.length === 0) {
      api.get('/questions').then(setQuestions).catch(() => setQuestions([]))
    }
  }, [mode])

  const filtered = q
    ? questions.filter((item) => item.text.toLowerCase().includes(q.toLowerCase()))
    : questions

  const toggle = (id) =>
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id)
      if (s.length >= 5) return s
      return [...s, id]
    })

  const start = async () => {
    setBusy(true)
    setErr(null)
    try {
      let body
      if (mode === 'random') body = { mode: 'random', count }
      else if (mode === 'selected') body = { mode: 'selected', question_ids: selected }
      else body = { mode: 'generated', count, company: company.trim() || null }

      const sess = await api.post('/sessions', body)
      sessionStorage.setItem(`session:${sess.id}`, JSON.stringify(sess))
      nav(`/session/${sess.id}`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="main">
      <div className="stack">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Start a practice session</h3>
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              className={mode === 'generated' ? '' : 'ghost'}
              onClick={() => setMode('generated')}
            >
              AI-generated
            </button>
            <button
              className={mode === 'random' ? '' : 'ghost'}
              onClick={() => setMode('random')}
            >
              Random
            </button>
            <button
              className={mode === 'selected' ? '' : 'ghost'}
              onClick={() => setMode('selected')}
            >
              Pick questions
            </button>
          </div>

          {mode === 'generated' && (
            <div className="stack">
              <div className="muted" style={{ fontSize: 13 }}>
                Gemini generates fresh behavioral questions, grounded in
                real-world interview writeups pulled from the web via Brave
                Search. Specify a company to tailor them — or leave it blank
                for general behavioral.
              </div>
              <div>
                <label className="muted">Company (optional)</label>
                <div style={{ marginTop: 6 }}>
                  <CompanyAutocomplete value={company} onChange={setCompany} />
                </div>
              </div>
              <div>
                <label className="muted">Number of questions (1–5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={count}
                  onChange={(e) =>
                    setCount(Math.max(1, Math.min(5, Number(e.target.value))))
                  }
                  style={{ width: 80, marginTop: 6 }}
                />
              </div>
            </div>
          )}

          {mode === 'random' && (
            <div>
              <label className="muted">Number of questions (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(1, Math.min(5, Number(e.target.value))))
                }
                style={{ width: 80, marginTop: 6 }}
              />
            </div>
          )}
        </div>

        {mode === 'selected' && (
          <div className="card">
            <div className="spread" style={{ marginBottom: 8 }}>
              <strong>Selected {selected.length}/5</strong>
              <input
                style={{ maxWidth: 300 }}
                placeholder="filter…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="stack" style={{ maxHeight: 420, overflow: 'auto' }}>
              {filtered.map((it) => (
                <label
                  key={it.id}
                  className="row"
                  style={{
                    padding: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    background: selected.includes(it.id) ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(it.id)}
                    onChange={() => toggle(it.id)}
                    style={{ width: 'auto' }}
                  />
                  <span>{it.text}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {err && <div className="card" style={{ color: 'var(--danger)' }}>{err}</div>}

        <div>
          <button
            onClick={start}
            disabled={busy || (mode === 'selected' && selected.length === 0)}
          >
            {busy
              ? (mode === 'generated' ? 'Generating questions…' : 'Starting…')
              : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  )
}
