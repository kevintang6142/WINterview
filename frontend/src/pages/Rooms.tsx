import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { main, card, stack, spread, muted, btnPrimary, btnGhost } from '../lib/ui'
import { ALL_CATEGORIES } from '../lib/categories'

interface PublicRoom {
  code: string
  name: string
  host_name: string | null
  player_count: number
  max_players: number
  status: string
  company: string | null
  question_count: number
  created_at: string
}

const RANGES = {
  questions: { min: 1, max: 10 },
  seconds: { min: 30, max: 600 },
  players: { min: 2, max: 20 },
}

function rangeError(label: string, value: number, { min, max }: { min: number; max: number }) {
  if (!Number.isFinite(value)) return `${label}: must be a number`
  if (value < min || value > max) return `${label}: must be between ${min} and ${max}`
  return null
}

export default function Rooms() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Form state — inputs hold raw strings so the user can type anything.
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [questionCount, setQuestionCount] = useState('3')
  const [maxResponseSeconds, setMaxResponseSeconds] = useState('180')
  const [maxPlayers, setMaxPlayers] = useState('8')
  const [company, setCompany] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set(ALL_CATEGORIES))

  const toggleCat = (cat: string) =>
    setCategories((prev) => {
      const n = new Set(prev)
      if (n.has(cat)) n.delete(cat); else n.add(cat)
      return n
    })

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await api.get('/rooms')
      setRooms(Array.isArray(data) ? data : [])
    } catch {
      setRooms([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  const create = async () => {
    setErr(null)

    const trimmed = name.trim()
    if (!trimmed) { setErr('Room name is required.'); return }
    if (trimmed.length > 40) { setErr('Room name must be 40 characters or fewer.'); return }

    const qc = Number(questionCount)
    const ms = Number(maxResponseSeconds)
    const mp = Number(maxPlayers)
    const issues = [
      rangeError('Questions', qc, RANGES.questions),
      rangeError('Max time per answer', ms, RANGES.seconds),
      rangeError('Max players', mp, RANGES.players),
    ].filter(Boolean) as string[]
    if (issues.length) { setErr(issues.join(' · ')); return }

    setCreating(true)
    try {
      const cats = categories.size < ALL_CATEGORIES.length ? [...categories] : []
      const res = await api.post('/rooms', {
        name: trimmed,
        is_public: isPublic,
        settings: {
          question_count: qc,
          max_response_seconds: ms,
          max_players: mp,
          company: company.trim() || null,
          categories: cats,
        },
      })
      nav(`/rooms/${res.code}`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setCreating(false)
    }
  }

  const join = (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    nav(`/rooms/${code}`)
  }

  return (
    <div className={main}>
      <div className={stack}>
        {user?.current_room_code && (
          <div className={`${card} flex items-center justify-between gap-3 flex-wrap`}
            style={{ borderColor: 'var(--blue-300)', background: 'var(--blue-50)' }}>
            <div>
              <strong className="text-[var(--blue-800)]">You're in a room</strong>
              <div className={`${muted} text-sm`}>
                Room <span style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>{user.current_room_code}</span>.
                You left the tab but didn't leave the room.
              </div>
            </div>
            <Link to={`/rooms/${user.current_room_code}`} className={btnPrimary}>
              Return to room
            </Link>
          </div>
        )}

        <div className={card}>
          <h3 className="mt-0 mb-3">Interview competition rooms</h3>
          <p className={`${muted} text-sm mt-0 mb-3`}>
            Create a room, invite friends by code (or make it public), and race
            through behavioral questions together. Highest total AI score wins.
          </p>

          <form className="flex items-stretch gap-2 mb-4" onSubmit={join}>
            <input
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.1em' }}
            />
            <button type="submit" className={btnGhost} disabled={!joinCode.trim()}>
              Join by code
            </button>
          </form>

          <details className="mb-2">
            <summary className="cursor-pointer font-semibold">Create a new room</summary>
            <div className={`${stack} mt-3`}>
              <div>
                <label className={`${muted} block mb-1`}>Room name (must be unique)</label>
                <input placeholder="e.g. Kev's FAANG prep"
                  value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    style={{ width: 16, height: 16 }} />
                  <span>Public (anyone can join from this list)</span>
                </label>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <label className={muted}>Questions (1–10)</label>
                <input type="number" value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                  style={{ width: 80 }} />
                <label className={muted}>Max time per answer (s, 30–600)</label>
                <input type="number" value={maxResponseSeconds}
                  onChange={(e) => setMaxResponseSeconds(e.target.value)}
                  style={{ width: 90 }} />
                <label className={muted}>Max players (2–20)</label>
                <input type="number" value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  style={{ width: 80 }} />
              </div>

              <div>
                <label className={`${muted} block mb-1`}>Company (optional)</label>
                <input placeholder="e.g. Google, Stripe, your startup"
                  value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>

              <div>
                <div className={`${muted} mb-2`}>
                  Categories&nbsp;
                  <span className="text-xs">
                    ({categories.size} / {ALL_CATEGORIES.length} selected — questions are sampled from these)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCat(cat)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        categories.has(cat)
                          ? 'bg-skin-accent text-white border-skin-accent'
                          : 'border-skin-border text-skin-muted'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button type="button" className={`${muted} text-xs underline`}
                    onClick={() => setCategories(new Set(ALL_CATEGORIES))}>All</button>
                  <button type="button" className={`${muted} text-xs underline`}
                    onClick={() => setCategories(new Set())}>None</button>
                </div>
              </div>

              {err && <div className="text-skin-danger text-sm">{err}</div>}

              <div>
                <button className={btnPrimary} onClick={create} disabled={creating}>
                  {creating ? 'Creating…' : 'Create room'}
                </button>
              </div>
            </div>
          </details>
        </div>

        <div className={card}>
          <div className={`${spread} mb-3`}>
            <strong>Public rooms</strong>
            <button className={`${btnGhost} text-xs`} onClick={refresh}>Refresh</button>
          </div>
          {loading && rooms.length === 0 && <div className={muted}>Loading…</div>}
          {!loading && rooms.length === 0 && (
            <div className={`${muted} text-sm`}>No public rooms right now. Create one!</div>
          )}
          <div className={stack}>
            {rooms.map((r) => (
              <Link key={r.code} to={`/rooms/${r.code}`}
                className="block border border-skin-border rounded-skin p-3 hover:bg-skin-surface-2 text-skin-text hover:no-underline">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold">{r.name}</span>
                  <span style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} className={`${muted} text-sm`}>
                    {r.code}
                  </span>
                  <span className={`${muted} text-sm`}>
                    hosted by {r.host_name ?? '—'}
                  </span>
                  <span className={`${muted} text-sm ml-auto`}>
                    {r.player_count}/{r.max_players} · {r.question_count} Qs
                    {r.company ? ` · ${r.company}` : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
