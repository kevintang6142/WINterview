import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { main, card, stack, spread, muted, btnPrimary, btnGhost } from '../lib/ui'

interface PublicRoom {
  code: string
  name: string
  host_name: string | null
  player_count: number
  max_players: number
  status: 'lobby' | 'running' | 'finished'
  company: string | null
  question_count: number
  current_round: number | null
  total_rounds: number
  created_at: string
}

export default function Rooms() {
  const nav = useNavigate()
  const { user, refresh: refreshAuth } = useAuth()
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Create-room form is now just name + public visibility — everything
  // else is configured in the lobby after creation.
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  // Only show the spinner on the very first fetch; periodic polls should
  // update data in place without flashing "Loading…".
  const initialLoadRef = useRef(true)
  const refresh = async () => {
    try {
      const data = await api.get('/rooms')
      setRooms(Array.isArray(data) ? data : [])
    } catch {
      if (initialLoadRef.current) setRooms([])
      // otherwise: preserve last-known list on transient errors
    } finally {
      if (initialLoadRef.current) {
        setLoading(false)
        initialLoadRef.current = false
      }
    }
  }

  useEffect(() => {
    refresh()
    // Also refresh auth on mount so the "Return to room" banner reflects the
    // server — critical after clicking Back from a room where the client's
    // cached user object may not yet know about current_room_code.
    refreshAuth()
    const t = setInterval(refresh, 5000)
    // Keep auth in sync while the page is open so the banner also disappears
    // if the room closes (server-side grace expired, everyone left, etc).
    const authT = setInterval(refreshAuth, 10000)
    return () => { clearInterval(t); clearInterval(authT) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = async () => {
    setErr(null)
    const trimmed = name.trim()
    if (trimmed.length > 40) { setErr('Room name must be 40 characters or fewer.'); return }
    setCreating(true)
    try {
      // Only send name + is_public. The backend uses its own sensible
      // defaults for question_count / max_response_seconds / etc., and the
      // host can tweak everything from the lobby settings panel.
      const res = await api.post('/rooms', {
        name: trimmed,
        is_public: isPublic,
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
          <div className={`${card} flex items-center justify-between gap-3 flex-wrap bg-[var(--blue-50)] border-[var(--blue-200)] dark:bg-[rgba(59,130,246,0.12)] dark:border-[var(--blue-800)]`}>
            <div>
              <strong className="text-[var(--blue-800)] dark:text-[var(--blue-300)]">
                You're still in{user.current_room_name ? ` "${user.current_room_name}"` : ' a room'}
              </strong>
              <div className={`${muted} text-sm`}>
                Code <span style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>{user.current_room_code}</span>
                {' '}— you left the tab but didn't leave the room.
              </div>
            </div>
            <Link to={`/rooms/${user.current_room_code}`} className={btnPrimary}>
              Return to room
            </Link>
          </div>
        )}

        <div className={card}>
          <div className="font-semibold mb-3">Interview competition rooms</div>
          <p className={`${muted} text-sm mt-0 mb-3`}>
            Create a room, invite friends by code (or make it public), and race
            through behavioral questions together. Highest total AI score wins.
          </p>

          <form className="flex items-stretch gap-2 mb-4 flex-wrap" onSubmit={join}>
            <input
              className="w-full sm:w-[180px]"
              placeholder="ROOM CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              style={{
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                letterSpacing: '0.18em',
                textAlign: 'center',
              }}
            />
            <button type="submit" className={btnGhost} disabled={!joinCode.trim()}>
              Join by code
            </button>
          </form>

          {/* Create a new room — just the essentials. Everything else
              (question count, time caps, categories, company, etc.) lives
              in the lobby settings panel once the host is inside the room. */}
          <div className="font-semibold mb-2">Create a new room</div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Room name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="w-[200px] max-w-full"
              />
              <button className={btnPrimary} onClick={create} disabled={creating}>
                {creating ? 'Creating…' : 'Create room'}
              </button>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span>Public</span>
              </label>
            </div>
          </div>
          {err && <div className="text-skin-danger text-sm mt-2">{err}</div>}
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
            {rooms.map((r) => {
              const inProgress = r.status === 'running'
              return (
                <Link key={r.code} to={`/rooms/${r.code}`}
                  className={`block border border-skin-border rounded-skin p-3 text-skin-text hover:no-underline ${
                    inProgress ? 'bg-skin-surface-2 hover:bg-skin-surface-2' : 'hover:bg-skin-surface-2'
                  }`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold">{r.name?.trim() || 'Untitled room'}</span>
                    <span style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} className={`${muted} text-sm`}>
                      {r.code}
                    </span>
                    {inProgress ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: 'var(--blue-100)',
                          color: 'var(--blue-800)',
                        }}
                        title="Game in progress — only existing players can rejoin"
                      >
                        In progress · {r.current_round}/{r.total_rounds}
                      </span>
                    ) : (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        Lobby
                      </span>
                    )}
                    <span className={`${muted} text-sm`}>
                      hosted by {r.host_name ?? '—'}
                    </span>
                    <span className={`${muted} text-sm w-full sm:w-auto sm:ml-auto`}>
                      {r.player_count}/{r.max_players} · {r.question_count} Qs
                      {r.company ? ` · ${r.company}` : ''}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
