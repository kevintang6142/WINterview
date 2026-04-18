import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useMastery, MasteryState } from '../mastery'
import MasteryDropdown from '../components/MasteryDropdown'
import { main, card, stack, row, tag, muted } from '../lib/ui'
import { Question } from '../types'

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

type SortMode = 'text' | 'category' | 'responses'

const MASTERY_STATES: MasteryState[] = ['none', 'in-progress', 'mastered']
const MASTERY_LABEL: Record<MasteryState, string> = { 'none': 'Not started', 'in-progress': 'In progress', 'mastered': 'Mastered' }

const SS_KEY = 'winterview.search.state'

function loadState() {
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return {
      q: s.q ?? '',
      selectedCats: new Set<string>(s.selectedCats ?? ALL_CATEGORIES),
      sort: (s.sort ?? 'text') as SortMode,
      selectedMastery: new Set<MasteryState>(s.selectedMastery ?? []),
    }
  } catch { return null }
}

export default function Search() {
  const { getState, masteryMap } = useMastery()
  const saved = loadState()
  const [q, setQ] = useState(saved?.q ?? '')
  const [selectedCats, setSelectedCats] = useState<Set<string>>(saved?.selectedCats ?? new Set(ALL_CATEGORIES))
  const [sort, setSort] = useState<SortMode>(saved?.sort ?? 'text')
  const [selectedMastery, setSelectedMastery] = useState<Set<MasteryState>>(saved?.selectedMastery ?? new Set())
  const [items, setItems] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // Persist state to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem(SS_KEY, JSON.stringify({
      q, selectedCats: [...selectedCats], sort, selectedMastery: [...selectedMastery],
    }))
  }, [q, selectedCats, sort, selectedMastery])

  useEffect(() => {
    setLoading(true)
    api.get('/questions').then(setItems).catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = items
    if (selectedCats.size > 0 && selectedCats.size < ALL_CATEGORIES.length)
      result = result.filter((it) => it.category && selectedCats.has(it.category))
    if (q.trim())
      result = result.filter((it) => it.text.toLowerCase().includes(q.trim().toLowerCase()))
    if (selectedMastery.size > 0 && selectedMastery.size < 3)
      result = result.filter((it) => selectedMastery.has(getState(it.id)))
    const copy = [...result]
    if (sort === 'text') copy.sort((a, b) => a.text.localeCompare(b.text))
    else if (sort === 'category') copy.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''))
    else copy.sort((a, b) => (b.public_response_count ?? 0) - (a.public_response_count ?? 0))
    return copy
  }, [items, q, selectedCats, sort, selectedMastery, masteryMap])

  const toggleCat = (cat: string) =>
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })

  const toggleMastery = (s: MasteryState) =>
    setSelectedMastery((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })

  const isFiltered = (selectedCats.size > 0 && selectedCats.size < ALL_CATEGORIES.length) || !!q.trim() || (selectedMastery.size > 0 && selectedMastery.size < 3)

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <h3 className="mt-0 mb-3">Search behavioral questions</h3>
          <input
            placeholder="Type to filter by question text…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5 items-center mt-2.5">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selectedCats.has(cat)
                    ? 'bg-skin-accent text-white border-skin-accent'
                    : 'border-skin-border text-skin-muted'
                }`}
              >
                {cat}
              </button>
            ))}
            <button className={`${muted} text-xs underline`} onClick={() => setSelectedCats(new Set(ALL_CATEGORIES))}>All</button>
            <button className={`${muted} text-xs underline`} onClick={() => setSelectedCats(new Set())}>None</button>
          </div>

          {/* Mastery filter – multi-select */}
          <div className={`${row} flex-wrap gap-1.5 items-center mt-3 pt-3 border-t border-skin-border`}>
            <span className={`${muted} text-xs shrink-0`}>Mastery:</span>
            {MASTERY_STATES.map((s) => (
              <button
                key={s}
                onClick={() => toggleMastery(s)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selectedMastery.has(s)
                    ? 'bg-skin-accent text-white border-skin-accent'
                    : 'border-skin-border text-skin-muted'
                }`}
              >
                {MASTERY_LABEL[s]}
              </button>
            ))}
            <button className={`${muted} text-xs underline`} onClick={() => setSelectedMastery(new Set(MASTERY_STATES))}>All</button>
            <button className={`${muted} text-xs underline`} onClick={() => setSelectedMastery(new Set())}>None</button>
          </div>

          {/* Sort controls */}
          <div className={`${row} gap-2 mt-3 pt-3 border-t border-skin-border`}>
            <span className={`${muted} text-xs shrink-0`}>Sort:</span>
            {(['text', 'category', 'responses'] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  sort === s
                    ? 'bg-skin-accent text-white border-skin-accent'
                    : 'border-skin-border text-skin-muted'
                }`}
              >
                {s === 'text' ? 'Question (A–Z)' : s === 'category' ? 'Category (A–Z)' : 'Most responses'}
              </button>
            ))}
          </div>
        </div>

        <div className={`${muted} text-sm`}>
          {loading ? 'Loading…' : `${filtered.length} question${filtered.length === 1 ? '' : 's'}${isFiltered ? ' matching filters' : ''}`}
        </div>

        {!loading && filtered.length === 0 && (
          <div className={`${card} ${muted}`}>No questions match your filters.</div>
        )}

        {filtered.map((it) => (
          <div key={it.id} className={card}>
            <Link to={`/question/${it.id}`} className="text-skin-text hover:no-underline block">
              <div className="font-semibold mb-1.5">{it.text}</div>
            </Link>
            <div className={`flex items-center flex-wrap gap-1.5 mt-2`}>
              {it.category && <span className={tag}>{it.category}</span>}
              <MasteryDropdown questionId={it.id} />
              <span className={`${muted} ml-auto`}>
                {it.public_response_count} response{it.public_response_count === 1 ? '' : 's'}
                {it.avg_rating != null ? ` · ⭐ ${it.avg_rating.toFixed(1)}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
