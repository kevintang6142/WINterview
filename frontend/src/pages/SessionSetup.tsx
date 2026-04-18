import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { main, card, stack, spread, row, muted, tag, btnPrimary, btnGhost } from '../lib/ui'
import { Question, SessionMode } from '../types'

const ALL_CATEGORIES = [
  'Adaptability', 'Ambition', 'Analytical Thinking', 'Building Relationships',
  'Caution', 'Communication', 'Confidentiality', 'Conflict Resolution',
  'Customer Service', 'Decision Making', 'Delegation', 'Detail-Oriented',
  'Developing Others', 'Flexibility', 'Follow-up & Control', 'Influence',
  'Initiative', 'Innovation', 'Integrity', 'Leadership', 'Listening',
  'Motivation', 'Negotiation', 'Performance Management', 'Perseverance',
  'Personal Effectiveness', 'Planning & Organization', 'Problem Solving',
  'Removing Obstacles', 'Self-Assessment', 'Setting Goals', 'Teamwork',
  'Values Diversity',
]

export default function SessionSetup() {
  const nav = useNavigate()
  const { state } = useLocation()
  const [mode, setMode] = useState<SessionMode>(state?.preselect ? 'selected' : 'random')
  const [count, setCount] = useState(3)
  // Random mode: all categories selected by default
  const [randomCats, setRandomCats] = useState<Set<string>>(new Set(ALL_CATEGORIES))
  // Pick mode
  const [questions, setQuestions] = useState<Question[]>([])
  const [selected, setSelected] = useState<string[]>(state?.preselect ? [state.preselect] : [])
  const [pickQ, setPickQ] = useState('')
  const [pickCats, setPickCats] = useState<Set<string>>(new Set(ALL_CATEGORIES))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'selected' && questions.length === 0)
      api.get('/questions').then(setQuestions).catch(() => setQuestions([]))
  }, [mode])

  const pickFiltered = useMemo(() => {
    let result = questions
    if (pickCats.size > 0 && pickCats.size < ALL_CATEGORIES.length)
      result = result.filter((it) => it.category && pickCats.has(it.category))
    if (pickQ.trim())
      result = result.filter((it) => it.text.toLowerCase().includes(pickQ.trim().toLowerCase()))
    return result
  }, [questions, pickQ, pickCats])

  const toggle = (id: string) =>
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id)
      if (s.length >= 10) return s
      return [...s, id]
    })

  const toggleRandomCat = (cat: string) =>
    setRandomCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })

  const togglePickCat = (cat: string) =>
    setPickCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })

  const start = async () => {
    setBusy(true); setErr(null)
    try {
      let body: Record<string, unknown>
      if (mode === 'random') {
        const cats = randomCats.size < ALL_CATEGORIES.length ? [...randomCats] : []
        body = { mode: 'random', count, categories: cats }
      } else {
        body = { mode: 'selected', question_ids: selected }
      }
      const sess = await api.post('/sessions', body)
      sessionStorage.setItem(`session:${sess.id}`, JSON.stringify(sess))
      nav(`/session/${sess.id}`)
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <h3 className="mt-0 mb-3">Start a practice session</h3>
          <div className={`${row} flex-wrap gap-2 mb-3`}>
            <button className={mode === 'random' ? btnPrimary : btnGhost} onClick={() => setMode('random')}>Random</button>
            <button className={mode === 'selected' ? btnPrimary : btnGhost} onClick={() => setMode('selected')}>Select questions</button>
          </div>

          {mode === 'random' && (
            <div className={stack}>
              <div>
                <div className="flex items-center gap-4">
                  <label className={muted}>Number of questions (1–10)</label>
                  <input type="number" min={1} max={10} value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value))))}
                    style={{ width: 80 }} />
                </div>
              </div>
              <div>
                <div className={`${muted} mb-2`}>
                  Filter by category&nbsp;
                  <span className="text-xs">
                    ({randomCats.size} / {ALL_CATEGORIES.length} selected)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleRandomCat(cat)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        randomCats.has(cat)
                          ? 'bg-skin-accent text-white border-skin-accent'
                          : 'border-skin-border text-skin-muted'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 mt-2">
                  <button className={`${muted} text-xs underline`} onClick={() => setRandomCats(new Set(ALL_CATEGORIES))}>All</button>
                  <button className={`${muted} text-xs underline`} onClick={() => setRandomCats(new Set())}>None</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {mode === 'selected' && (
          <div className={card}>
            <div className={`${spread} mb-2`}>
              <strong>{selected.length} question{selected.length === 1 ? '' : 's'} selected <span className={muted}>(max 10)</span></strong>
              <span className={`${muted} text-sm`}>{pickFiltered.length} shown</span>
            </div>
            {/* Search + category filter for pick mode */}
            <div className={`${stack} mb-3`}>
              <input placeholder="Filter by question text…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => togglePickCat(cat)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      pickCats.has(cat)
                        ? 'bg-skin-accent text-white border-skin-accent'
                        : 'border-skin-border text-skin-muted'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <div className="flex gap-3 mt-1">
                  <button className={`${muted} text-xs underline`} onClick={() => setPickCats(new Set(ALL_CATEGORIES))}>All</button>
                  <button className={`${muted} text-xs underline`} onClick={() => setPickCats(new Set())}>None</button>
                </div>
              </div>
            </div>
            <div className={`${stack} max-h-[420px] overflow-auto`}>
              {pickFiltered.map((it) => (
                <label
                  key={it.id}
                  className={`${row} p-2 border border-skin-border rounded-skin cursor-pointer ${selected.includes(it.id) ? 'bg-skin-surface-2' : 'bg-transparent'}`}
                >
                  <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(it.id)} style={{ width: 'auto' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{it.text}</div>
                    {it.category && <span className={`${tag} mt-1`}>{it.category}</span>}
                  </div>
                </label>
              ))}
              {pickFiltered.length === 0 && (
                <div className={`${muted} text-sm`}>No questions match your filters.</div>
              )}
            </div>
          </div>
        )}

        {err && <div className={`${card} text-skin-danger`}>{err}</div>}

        <div>
          <button
            className={btnPrimary}
            onClick={start}
            disabled={busy || (mode === 'selected' && selected.length === 0) || (mode === 'random' && randomCats.size === 0)}
          >
            {busy ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  )
}
