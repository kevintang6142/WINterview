import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useMastery, MasteryState } from '../mastery'
import MasteryDropdown from '../components/MasteryDropdown'
import CompanyAutocomplete from '../components/CompanyAutocomplete'
import { main, card, stack, row, muted, tag, btnPrimary, btnGhost } from '../lib/ui'
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

type MasteryFilter = Set<MasteryState>
type PickSortMode = 'text' | 'category'
const ALL_MASTERY: MasteryState[] = ['none', 'in-progress', 'mastered']
const MASTERY_LABEL: Record<MasteryState, string> = { 'none': 'Not started', 'in-progress': 'In progress', 'mastered': 'Mastered' }
const SS_KEY = 'winterview.setup.state'

function loadSetupState(preselect?: string) {
  if (preselect) return null  // don't restore stale state when arriving via "Answer this question"
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return {
      mode: (s.mode ?? 'random') as SessionMode,
      count: s.count ?? 3,
      randomCats: new Set<string>(s.randomCats ?? ALL_CATEGORIES),
      selected: (s.selected ?? []) as string[],
      pickQ: s.pickQ ?? '',
      pickCats: new Set<string>(s.pickCats ?? ALL_CATEGORIES),
      pickMastery: new Set<MasteryState>(s.pickMastery ?? []),
      pickSort: (s.pickSort ?? 'text') as PickSortMode,
      company: typeof s.company === 'string' ? s.company : '',
    }
  } catch { return null }
}

export default function SessionSetup() {
  const nav = useNavigate()
  const { state } = useLocation()
  const { getState, masteryMap } = useMastery()
  const preselect = state?.preselect as string | undefined
  const saved = loadSetupState(preselect)

  const [mode, setMode] = useState<SessionMode>(preselect ? 'selected' : (saved?.mode ?? 'random'))
  // Keep raw input text so the user can type anything — validate at Start.
  const [count, setCount] = useState(String(saved?.count ?? 3))
  const [randomCats, setRandomCats] = useState<Set<string>>(saved?.randomCats ?? new Set(ALL_CATEGORIES))
  const [questions, setQuestions] = useState<Question[]>([])
  const [selected, setSelected] = useState<string[]>(preselect ? [preselect] : (saved?.selected ?? []))
  const [pickQ, setPickQ] = useState(saved?.pickQ ?? '')
  const [pickCats, setPickCats] = useState<Set<string>>(saved?.pickCats ?? new Set(ALL_CATEGORIES))
  const [pickMastery, setPickMastery] = useState<Set<MasteryState>>(saved?.pickMastery ?? new Set())
  const [pickSort, setPickSort] = useState<PickSortMode>(saved?.pickSort ?? 'text')
  const [company, setCompany] = useState(saved?.company ?? '')
  const [companyBusy, setCompanyBusy] = useState(false)
  const [companyInfo, setCompanyInfo] = useState<{ mode: SessionMode; categories: string[]; reason: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const applyCompanyFilter = async () => {
    const q = company.trim()
    if (!q || companyBusy) return
    setCompanyBusy(true)
    setErr(null)
    try {
      const res = await api.get(`/suggest/company-categories?q=${encodeURIComponent(q)}`)
      const cats: string[] = Array.isArray(res?.categories) ? res.categories : []
      if (cats.length === 0) {
        setErr(`Couldn't infer categories for "${q}". Try a different name or pick manually.`)
        setCompanyInfo(null)
        return
      }
      const allowed = cats.filter((c) => ALL_CATEGORIES.includes(c))
      if (mode === 'random') setRandomCats(new Set(allowed))
      else setPickCats(new Set(allowed))
      setCompanyInfo({ mode, categories: allowed, reason: res?.reason ?? null })
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setCompanyBusy(false)
    }
  }

  useEffect(() => {
    if (mode === 'selected' && questions.length === 0)
      api.get('/questions').then(setQuestions).catch(() => setQuestions([]))
  }, [mode])

  // Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(SS_KEY, JSON.stringify({
      mode, count,
      randomCats: [...randomCats],
      selected,
      pickQ,
      pickCats: [...pickCats],
      pickMastery: [...pickMastery],
      pickSort,
      company,
    }))
  }, [mode, count, randomCats, selected, pickQ, pickCats, pickMastery, pickSort, company])

  const pickFiltered = useMemo(() => {
    let result = questions
    if (pickCats.size > 0 && pickCats.size < ALL_CATEGORIES.length)
      result = result.filter((it) => it.category && pickCats.has(it.category))
    if (pickQ.trim())
      result = result.filter((it) => it.text.toLowerCase().includes(pickQ.trim().toLowerCase()))
    if (pickMastery.size > 0 && pickMastery.size < 3)
      result = result.filter((it) => pickMastery.has(getState(it.id)))
    const copy = [...result]
    if (pickSort === 'text') copy.sort((a, b) => a.text.localeCompare(b.text))
    else copy.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''))
    return copy
  }, [questions, pickQ, pickCats, pickMastery, pickSort, masteryMap])

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

  const togglePickMastery = (s: MasteryState) =>
    setPickMastery((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })

  const start = async () => {
    setErr(null)
    let body: Record<string, unknown>
    if (mode === 'random') {
      const n = Number(count)
      if (!Number.isFinite(n) || n < 1 || n > 10) {
        setErr('Number of questions must be between 1 and 10.')
        return
      }
      const cats = randomCats.size < ALL_CATEGORIES.length ? [...randomCats] : []
      const trimmedCompany = company.trim()
      body = {
        mode: 'random',
        count: n,
        categories: cats,
        ...(trimmedCompany ? { company: trimmedCompany } : {}),
      }
    } else {
      body = { mode: 'selected', question_ids: selected }
    }
    setBusy(true)
    try {
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
              <CompanyFilterBlock
                company={company}
                setCompany={setCompany}
                busy={companyBusy}
                onApply={applyCompanyFilter}
                info={companyInfo?.mode === 'random' ? companyInfo : null}
              />
              <div>
                <div className="flex items-center gap-4">
                  <label className={muted}>Number of questions (1–10)</label>
                  <input type="number" value={count}
                    onChange={(e) => setCount(e.target.value)}
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
                <div className="flex flex-wrap gap-1.5 items-center">
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
                  <button className={`${muted} text-xs underline`} onClick={() => setRandomCats(new Set(ALL_CATEGORIES))}>All</button>
                  <button className={`${muted} text-xs underline`} onClick={() => setRandomCats(new Set())}>None</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {mode === 'selected' && (
          <>
            <div className={card}>
              <h3 className="mt-0 mb-3">Filter questions</h3>
              <input placeholder="Filter by question text…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />

              {/* Company filter */}
              <div className="mt-3">
                <CompanyFilterBlock
                  company={company}
                  setCompany={setCompany}
                  busy={companyBusy}
                  onApply={applyCompanyFilter}
                  info={companyInfo?.mode === 'selected' ? companyInfo : null}
                />
              </div>

              {/* Category chips */}
              <div className="flex flex-wrap gap-1.5 items-center mt-3 pt-3 border-t border-skin-border">
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
                <button className={`${muted} text-xs underline`} onClick={() => setPickCats(new Set(ALL_CATEGORIES))}>All</button>
                <button className={`${muted} text-xs underline`} onClick={() => setPickCats(new Set())}>None</button>
              </div>

              {/* Mastery filter */}
              <div className={`${row} flex-wrap gap-1.5 items-center mt-3 pt-3 border-t border-skin-border`}>
                <span className={`${muted} text-xs shrink-0`}>Mastery:</span>
                {ALL_MASTERY.map((s) => (
                  <button
                    key={s}
                    onClick={() => togglePickMastery(s)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      pickMastery.has(s)
                        ? 'bg-skin-accent text-white border-skin-accent'
                        : 'border-skin-border text-skin-muted'
                    }`}
                  >
                    {MASTERY_LABEL[s]}
                  </button>
                ))}
                <button className={`${muted} text-xs underline`} onClick={() => setPickMastery(new Set(ALL_MASTERY))}>All</button>
                <button className={`${muted} text-xs underline`} onClick={() => setPickMastery(new Set())}>None</button>
              </div>

              {/* Sort controls */}
              <div className={`${row} gap-2 mt-3 pt-3 border-t border-skin-border`}>
                <span className={`${muted} text-xs shrink-0`}>Sort:</span>
                {(['text', 'category'] as PickSortMode[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPickSort(s)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      pickSort === s
                        ? 'bg-skin-accent text-white border-skin-accent'
                        : 'border-skin-border text-skin-muted'
                    }`}
                  >
                    {s === 'text' ? 'Question (A–Z)' : 'Category (A–Z)'}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${muted} text-sm`}>
              {pickFiltered.length} question{pickFiltered.length === 1 ? '' : 's'}{(pickCats.size < ALL_CATEGORIES.length || pickQ.trim() || (pickMastery.size > 0 && pickMastery.size < 3)) ? ' matching filters' : ''}
            </div>

            {pickFiltered.length === 0 && (
              <div className={`${card} ${muted}`}>No questions match your filters.</div>
            )}

            {pickFiltered.map((it) => (
              <div
                key={it.id}
                className={`${card} cursor-pointer ${selected.includes(it.id) ? 'ring-1 ring-skin-accent' : ''}`}
                onClick={() => toggle(it.id)}
              >
                <div className={`${row} gap-3`}>
                  <input
                    type="checkbox"
                    checked={selected.includes(it.id)}
                    onChange={() => toggle(it.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 'auto', flexShrink: 0 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1.5">{it.text}</div>
                    <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                      {it.category && <span className={tag}>{it.category}</span>}
                      <MasteryDropdown questionId={it.id} stopPropagation />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {err && <div className={`${card} text-skin-danger`}>{err}</div>}

        <div>
          {mode === 'selected' && (
            <div className={`${muted} text-sm mb-2`}>
              {selected.length} question{selected.length === 1 ? '' : 's'} selected <span className="text-xs">(max 10)</span>
            </div>
          )}
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

function CompanyFilterBlock({
  company, setCompany, busy, onApply, info,
}: {
  company: string
  setCompany: (v: string) => void
  busy: boolean
  onApply: () => void
  info: { categories: string[]; reason: string | null } | null
}) {
  const trimmed = company.trim()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed && !busy) onApply()
      }}
    >
      <label className={`${muted} block mb-1.5`}>
        Company <span className="text-xs">(optional — Brave + Gemini will pick the categories this company tends to ask about)</span>
      </label>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          <CompanyAutocomplete value={company} onChange={setCompany} />
        </div>
        <button
          type="submit"
          disabled={!trimmed || busy}
          title="Filter categories based on what this company typically asks about (press Enter)"
          className={`${btnPrimary} whitespace-nowrap inline-flex items-center gap-1.5`}
        >
          <svg
            width="14" height="14" viewBox="0 0 20 20" fill="none"
            xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
          >
            <path d="M3 4.5h14L12 11v5l-4 2v-7L3 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {busy ? 'Filtering…' : 'Filter by company'}
        </button>
      </div>
      {info && info.categories.length > 0 && (
        <div className={`${muted} text-xs mt-2`}>
          <strong>Applied:</strong>{' '}
          {info.categories.join(', ')}
          {info.reason && (
            <>
              <br />
              <em>{info.reason}</em>
            </>
          )}
        </div>
      )}
    </form>
  )
}
