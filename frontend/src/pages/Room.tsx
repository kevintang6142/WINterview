import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import {
  main, card, stack, spread, muted, tag, btnPrimary, btnGhost, thumb, ttsWord, ttsActive,
} from '../lib/ui'
import { ALL_CATEGORIES } from '../lib/categories'
import { Evaluation } from '../types'

// ── Types from the server ────────────────────────────────────────────────────
interface ServerPlayer {
  user_id: string
  name: string
  picture: string | null
  scores: (number | null)[]
  ready: boolean
  connected: boolean
}
interface ServerQuestion { id: string; text: string; category: string }
interface RoomState {
  code: string
  name: string
  is_public: boolean
  host_user_id: string
  settings: {
    question_count: number
    max_response_seconds: number
    categories: string[]
    company: string | null
    max_players: number
  }
  status: 'lobby' | 'running' | 'finished'
  players: ServerPlayer[]
  current_index: number
  current_question: ServerQuestion | null
  round_deadline: number | null
  questions_total: number
}
interface LeaderboardEntry {
  user_id: string
  name: string
  picture: string | null
  scores: (number | null)[]
  total: number
  avg: number
}

// Per-question evaluation the client keeps *locally* for the final summary.
// (Server only broadcasts overall to other players — feedback stays private.)
interface StoredEval {
  question_index: number
  question_text: string
  question_category: string
  evaluation: Evaluation | null
  transcript: string
}

interface WordTiming { start: number; end: number; word: string }
interface Segment { text: string; word_index: number }

function wsUrl(code: string): string {
  const base = (api.base || '').replace(/^http/, 'ws')
  const token = localStorage.getItem('winterview.token') || ''
  return `${base}/rooms/${code}/ws?token=${encodeURIComponent(token)}`
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-skin-muted'
  if (score >= 4) return 'text-emerald-700 dark:text-emerald-400'
  if (score >= 3) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-700 dark:text-red-400'
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// The same mic base style practice mode uses — keep them visually identical.
const micBase =
  'w-24 h-24 rounded-full text-sm inline-flex items-center justify-center ' +
  'font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0'

// Rubric metric ordering — mirrors SessionResult.tsx.
const METRIC_KEYS: { key: keyof Evaluation; label: string }[] = [
  { key: 'structure_star',    label: 'Structure (STAR)' },
  { key: 'specificity_depth', label: 'Specificity & Depth' },
  { key: 'delivery_pacing',   label: 'Delivery (Pacing & Fillers)' },
  { key: 'relevance',         label: 'Relevance to Question' },
  { key: 'reflection',        label: 'Reflection & Self-Awareness' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Top-level Room component
// ─────────────────────────────────────────────────────────────────────────────
export default function Room() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const { user, refresh: refreshAuth } = useAuth()
  const [state, setState] = useState<RoomState | null>(null)
  const [finalBoard, setFinalBoard] = useState<LeaderboardEntry[] | null>(null)
  const [wsError, setWsError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Accumulate this player's per-question evaluations across the session
  // so we can show full feedback only at the end.
  const [storedEvals, setStoredEvals] = useState<StoredEval[]>([])

  useEffect(() => {
    const ws = new WebSocket(wsUrl(code))
    wsRef.current = ws
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'state') setState(msg.room)
      else if (msg.type === 'finished') {
        setState(msg.room)
        setFinalBoard(msg.leaderboard)
      } else if (msg.type === 'error') setWsError(msg.message)
    }
    ws.onclose = (ev) => {
      if (ev.code === 4404) {
        setWsError('Room not found. It may have ended.')
        // Server already cleared current_room_code — update local auth so the
        // resume banner on /rooms goes away.
        refreshAuth?.()
      } else if (ev.code === 4401) {
        setWsError('Please sign in again.')
      }
    }
    return () => { try { ws.close() } catch {} }
  }, [code])

  const send = (msg: any) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  // "Leave" = clear the room from the server + DB + navigate away.
  const leave = () => {
    send({ type: 'leave' })
    try { wsRef.current?.close() } catch {}
    refreshAuth?.()
    nav('/rooms')
  }

  // "Back" = close the WS but stay in the room on the server. User can return.
  const back = () => {
    try { wsRef.current?.close() } catch {}
    nav('/rooms')
  }

  const recordEval = (e: StoredEval) => {
    setStoredEvals((arr) => {
      const without = arr.filter((x) => x.question_index !== e.question_index)
      return [...without, e].sort((a, b) => a.question_index - b.question_index)
    })
  }

  // Keep the browser tab title in sync with the room name while we're here.
  useEffect(() => {
    const prev = document.title
    if (state?.name) document.title = `${state.name} · WINterview`
    return () => { document.title = prev }
  }, [state?.name])

  if (wsError) {
    return (
      <div className={main}>
        <div className={card}>
          <p className="text-skin-danger font-semibold">{wsError}</p>
          <Link to="/rooms" className={btnGhost}>Back to rooms</Link>
        </div>
      </div>
    )
  }
  if (!state) {
    return <div className={main}><div className={card}>Connecting to room <code>{code}</code>…</div></div>
  }

  const isHost = user?.id === state.host_user_id

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <div className={`${spread} flex-wrap gap-3`}>
            <div>
              <div className="text-xl font-extrabold leading-tight">{state.name}</div>
              <div className={`${muted} text-xs mt-0.5`}>
                <span style={{ fontFamily: 'monospace', letterSpacing: '0.12em' }}>{state.code}</span>
                {' · '}{state.is_public ? 'Public' : 'Private'}
                {' · '}{state.status}
              </div>
            </div>
            <div className={`${muted} text-sm text-right`}>
              {state.players.length}/{state.settings.max_players} players
            </div>
            <div className="flex gap-2">
              <button className={btnGhost} onClick={back}>Back</button>
              <button className={btnGhost} onClick={leave}>Leave</button>
            </div>
          </div>
        </div>

        {state.status === 'lobby' && (
          <LobbyView state={state} isHost={isHost} send={send} />
        )}

        {state.status === 'running' && state.current_question && (
          <SessionView
            state={state}
            me={user?.id ?? ''}
            send={send}
            recordEval={recordEval}
            key={state.current_index}
          />
        )}

        {state.status === 'finished' && finalBoard && (
          <FinalView
            state={state}
            leaderboard={finalBoard}
            myEvals={storedEvals}
            onBack={back}
            onLeave={leave}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby
// ─────────────────────────────────────────────────────────────────────────────
function LobbyView({
  state, isHost, send,
}: { state: RoomState; isHost: boolean; send: (m: any) => void }) {
  // Raw strings so the user can type anything. Validate at propagate time.
  const [questionCount, setQuestionCount] = useState(String(state.settings.question_count))
  const [maxResponseSeconds, setMaxResponseSeconds] = useState(String(state.settings.max_response_seconds))
  const [company, setCompany] = useState(state.settings.company ?? '')
  const [maxPlayers, setMaxPlayers] = useState(String(state.settings.max_players))
  const [cats, setCats] = useState<Set<string>>(
    new Set(
      state.settings.categories.length > 0 ? state.settings.categories : ALL_CATEGORIES,
    ),
  )

  const toggleCat = (cat: string) => {
    if (!isHost) return
    setCats((prev) => {
      const n = new Set(prev)
      if (n.has(cat)) n.delete(cat); else n.add(cat)
      return n
    })
  }

  // Auto-propagate host edits to everyone (debounced) so the "Save settings"
  // button isn't needed.
  const sendSettings = (override?: Partial<{
    qc: number; ms: number; mp: number; co: string; catsArr: string[]
  }>) => {
    if (!isHost) return
    const qc = override?.qc ?? Number(questionCount)
    const ms = override?.ms ?? Number(maxResponseSeconds)
    const mp = override?.mp ?? Number(maxPlayers)
    const co = override?.co ?? company
    const catsArr = override?.catsArr ?? (cats.size < ALL_CATEGORIES.length ? [...cats] : [])
    // Only send if all numeric values are valid — otherwise waiting for user
    // to finish typing.
    if (!Number.isFinite(qc) || qc < 1 || qc > 10) return
    if (!Number.isFinite(ms) || ms < 30 || ms > 600) return
    if (!Number.isFinite(mp) || mp < 2 || mp > 20) return
    send({
      type: 'settings',
      settings: {
        question_count: qc,
        max_response_seconds: ms,
        company: co.trim() || null,
        max_players: mp,
        categories: catsArr,
      },
    })
  }

  // Debounced propagation whenever any host-editable value changes.
  useEffect(() => {
    if (!isHost) return
    const t = setTimeout(() => sendSettings(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCount, maxResponseSeconds, maxPlayers, company, cats])

  // Validate current numeric state for the Start button.
  const qcNum = Number(questionCount)
  const msNum = Number(maxResponseSeconds)
  const mpNum = Number(maxPlayers)
  const startErr =
    !isHost ? null :
    !Number.isFinite(qcNum) || qcNum < 1 || qcNum > 10 ? 'Questions must be 1–10' :
    !Number.isFinite(msNum) || msNum < 30 || msNum > 600 ? 'Max answer time must be 30–600s' :
    !Number.isFinite(mpNum) || mpNum < 2 || mpNum > 20 ? 'Max players must be 2–20' :
    cats.size === 0 ? 'Select at least one category' :
    null

  return (
    <>
      <div className={card}>
        <h3 className="mt-0 mb-2">Players</h3>
        <div className={stack}>
          {state.players.map((p) => (
            <div key={p.user_id} className="flex items-center gap-2">
              {p.picture && <img src={p.picture} alt="" className={thumb} />}
              <span className="font-medium">{p.name}</span>
              {p.user_id === state.host_user_id && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-skin-accent text-white">host</span>
              )}
              {!p.connected && <span className={`${muted} text-xs`}>disconnected</span>}
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="mt-0 mb-2">
          Settings {!isHost && <span className={`${muted} text-xs font-normal`}>(host-only)</span>}
        </h3>
        <div className={stack}>
          <div className="flex items-center gap-4 flex-wrap">
            <label className={muted}>Questions (1–10)</label>
            <input type="number" value={questionCount}
              disabled={!isHost}
              onChange={(e) => setQuestionCount(e.target.value)}
              style={{ width: 80 }} />
            <label className={muted}>Max answer time (s, 30–600)</label>
            <input type="number" value={maxResponseSeconds}
              disabled={!isHost}
              onChange={(e) => setMaxResponseSeconds(e.target.value)}
              style={{ width: 90 }} />
            <label className={muted}>Max players (2–20)</label>
            <input type="number" value={maxPlayers}
              disabled={!isHost}
              onChange={(e) => setMaxPlayers(e.target.value)}
              style={{ width: 80 }} />
          </div>
          <div>
            <label className={`${muted} block mb-1`}>Company (optional)</label>
            <input value={company} disabled={!isHost}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google, Stripe, your startup" />
          </div>
          <div>
            <div className={`${muted} mb-2`}>
              Categories&nbsp;
              <span className="text-xs">
                ({cats.size} / {ALL_CATEGORIES.length} selected — questions are sampled from these)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCat(cat)}
                  disabled={!isHost}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    cats.has(cat)
                      ? 'bg-skin-accent text-white border-skin-accent'
                      : 'border-skin-border text-skin-muted'
                  } ${!isHost ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {cat}
                </button>
              ))}
              {isHost && (
                <>
                  <button type="button" className={`${muted} text-xs underline`}
                    onClick={() => setCats(new Set(ALL_CATEGORIES))}>All</button>
                  <button type="button" className={`${muted} text-xs underline`}
                    onClick={() => setCats(new Set())}>None</button>
                </>
              )}
            </div>
          </div>
          {isHost && (
            <div className="flex gap-2 items-center flex-wrap">
              <button className={btnPrimary}
                onClick={() => send({ type: 'start' })}
                disabled={!!startErr}>
                Start competition
              </button>
              {startErr && <span className="text-skin-danger text-sm">{startErr}</span>}
            </div>
          )}
          {!isHost && (
            <div className={`${muted} text-sm`}>
              Waiting for the host to start the competition…
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// In-session: play TTS (word-highlighted), record, submit score
// ─────────────────────────────────────────────────────────────────────────────
type Phase = 'playing' | 'ready-to-record' | 'recording' | 'processing' | 'submitted' | 'error'

function SessionView({
  state, me, send, recordEval,
}: {
  state: RoomState
  me: string
  send: (m: any) => void
  recordEval: (e: StoredEval) => void
}) {
  const q = state.current_question!
  const [phase, setPhase] = useState<Phase>('playing')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [alignment, setAlignment] = useState<{ words: WordTiming[]; segments: Segment[] } | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Perceived timer anchor: when TTS finished. Drives the displayed clock
  // and the hard cap, so time spent approving mic perms still counts against
  // the answer budget.
  const timerStartRef = useRef(0)
  // Actual speaking anchor: when MediaRecorder.start() fires. Drives the
  // duration_seconds sent to the backend for pacing analysis.
  const recordStartRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const tickRef = useRef<number | null>(null)
  const hardCapRef = useRef<number | null>(null)

  useEffect(() => {
    setPhase('playing')
    setScore(null)
    setEvaluation(null)
    setError(null)
    setElapsed(0)
    setAlignment(null)
    setHighlightIndex(-1)
    chunksRef.current = []
    timerStartRef.current = 0
    recordStartRef.current = 0
    playTTS()
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
      if (hardCapRef.current) window.clearTimeout(hardCapRef.current)
      cancelAnimationFrame(rafRef.current)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id])

  const playTTS = async () => {
    try {
      const resp = await api.post('/voice/tts-timed', { text: q.text })
      const ws: WordTiming[] = resp.words || []
      const segs: Segment[] = resp.segments || []
      setAlignment({ words: ws, segments: segs })
      const audio = new Audio(`data:audio/mpeg;base64,${resp.audio_base64}`)
      audioRef.current = audio
      let lastIdx = -1
      const tick = () => {
        if (!audioRef.current) return
        const t = audio.currentTime
        let idx = -1
        for (let i = 0; i < ws.length; i++) {
          if (t < ws[i].start) break
          if (t <= ws[i].end) { idx = i; break }
          idx = i
        }
        if (idx !== lastIdx) { lastIdx = idx; setHighlightIndex(idx) }
        rafRef.current = requestAnimationFrame(tick)
      }
      audio.onplay = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tick) }
      audio.onpause = () => cancelAnimationFrame(rafRef.current)
      audio.onended = () => {
        cancelAnimationFrame(rafRef.current)
        setHighlightIndex(-1)
        audioRef.current = null
        beginAnswerWindow()
      }
      audio.onerror = () => {
        cancelAnimationFrame(rafRef.current)
        audioRef.current = null
        beginAnswerWindow()
      }
      await audio.play()
    } catch {
      beginAnswerWindow()
    }
  }

  // Kick off the user's perceived answer window: timer + hard cap start now,
  // *before* we prompt for mic permissions, so deliberation time counts.
  const beginAnswerWindow = () => {
    setPhase('ready-to-record')
    timerStartRef.current = Date.now()
    setElapsed(0)
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      setElapsed((Date.now() - timerStartRef.current) / 1000)
    }, 200)
    if (hardCapRef.current) window.clearTimeout(hardCapRef.current)
    hardCapRef.current = window.setTimeout(() => {
      // If the mic went live, stop it cleanly and let onstop submit.
      if (mediaRef.current && mediaRef.current.state !== 'inactive') {
        mediaRef.current.stop()
        return
      }
      // Otherwise (perms never resolved / still "ready-to-record"): submit 0.
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null }
      send({ type: 'submit_score', question_index: state.current_index, overall: 0 })
      setScore(0)
      setPhase('submitted')
    }, state.settings.max_response_seconds * 1000)
    startRecording()
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        // duration is actual speaking time (rec.start → rec.stop), so pacing
        // analysis isn't inflated by mic-perm deliberation.
        const duration = recordStartRef.current
          ? (Date.now() - recordStartRef.current) / 1000
          : 0
        handleAudio(new Blob(chunksRef.current, { type: mime }), duration)
      }
      mediaRef.current = rec
      recordStartRef.current = Date.now()
      rec.start()
      // Timer + hard cap were already started in beginAnswerWindow — don't
      // reset them, the displayed elapsed should keep ticking from TTS end.
      setPhase('recording')
    } catch (e: any) {
      setError(`Microphone error: ${e.message}`)
      setPhase('error')
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null }
      if (hardCapRef.current) { window.clearTimeout(hardCapRef.current); hardCapRef.current = null }
    }
  }

  const stopRecording = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null }
    if (hardCapRef.current) { window.clearTimeout(hardCapRef.current); hardCapRef.current = null }
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
  }

  const handleAudio = async (blob: Blob, duration: number) => {
    setPhase('processing')
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'answer.webm')
      const stt = await api.postForm('/voice/stt', fd)
      const transcript = stt.text ?? ''
      const saved = await api.post('/responses', {
        session_id: `room:${state.code}`,
        question_id: q.id,
        transcript,
        duration_seconds: duration,
        word_timestamps: stt.word_timestamps ?? [],
      })
      const ev: Evaluation | undefined = saved?.evaluation
      const overall = ev?.overall ?? 0
      setScore(overall)
      setEvaluation(ev ?? null)
      recordEval({
        question_index: state.current_index,
        question_text: q.text,
        question_category: q.category || '',
        evaluation: ev ?? null,
        transcript,
      })
      send({ type: 'submit_score', question_index: state.current_index, overall })
      setPhase('submitted')
    } catch (e: any) {
      setError(`Failed: ${e.message}. Submitting a 0.`)
      send({ type: 'submit_score', question_index: state.current_index, overall: 0 })
      setPhase('submitted')
    }
  }

  // Practice-style rendering: wrap each segment so the spoken word highlights.
  const questionNode = useMemo(() => {
    const segs = alignment?.segments
    if (!segs || segs.length === 0) return <span>{q.text}</span>
    return segs.map((seg, i) => {
      if (seg.word_index === -1) return <span key={i}>{seg.text}</span>
      const isActive = phase === 'playing' && seg.word_index === highlightIndex
      return (
        <span key={i} className={phase === 'playing' ? (isActive ? ttsActive : ttsWord) : ''}>
          {seg.text}
        </span>
      )
    })
  }, [alignment, highlightIndex, phase, q.text])

  const maxSecs = state.settings.max_response_seconds
  const you = state.players.find((p) => p.user_id === me)
  const waitingFor = state.players.filter((p) => p.connected && !p.ready).length
  const totalConnected = state.players.filter((p) => p.connected).length

  // Running average of this player's scores so far (including current round).
  const myScored = (you?.scores ?? []).filter((s): s is number => s != null)
  const runningAvg = myScored.length ? myScored.reduce((a, b) => a + b, 0) / myScored.length : null

  return (
    <>
      <div className={card}>
        <div className={`${muted} mb-1`}>Question {state.current_index + 1} of {state.questions_total}</div>
        <div className="text-lg font-semibold leading-snug mb-2">{questionNode}</div>
        {q.category && <div className="mb-2"><span className={tag}>{q.category}</span></div>}

        <div className="flex flex-col items-center my-6 gap-2">
          {phase === 'recording' ? (
            <>
              <button className={`${micBase} bg-skin-danger text-white animate-mic-pulse`}
                onClick={stopRecording}>⏹ Stop</button>
              <div className={`${muted} tabular-nums`}>{fmt(elapsed)} / {fmt(maxSecs)}</div>
            </>
          ) : phase === 'ready-to-record' ? (
            <>
              <button className={`${micBase} bg-skin-danger text-white opacity-70 cursor-not-allowed`}
                disabled>
                Allow mic…
              </button>
              <div className={`${muted} tabular-nums`}>{fmt(elapsed)} / {fmt(maxSecs)}</div>
            </>
          ) : phase === 'submitted' ? (
            <button className={`${micBase} bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800 cursor-not-allowed`} disabled>
              Saved
            </button>
          ) : phase === 'processing' ? (
            <button className={`${micBase} bg-skin-accent text-white opacity-50 cursor-not-allowed`} disabled>
              Scoring…
            </button>
          ) : (
            <button className={`${micBase} bg-skin-accent text-white opacity-50 cursor-not-allowed`} disabled>
              {phase === 'playing' ? 'Reading…' : '…'}
            </button>
          )}
        </div>

        {error && <div className={`${card} bg-skin-surface-2 text-skin-danger`}>{error}</div>}
      </div>

      {phase === 'submitted' && (
        <div className={card}>
          <div className={spread}>
            <div>
              Your score this round:{' '}
              <span className={`font-bold text-xl ${scoreColor(score)}`}>
                {score != null ? score.toFixed(1) : '—'}/5
              </span>
            </div>
            <div className={`${muted} text-xs`}>
              Detailed feedback shows at the end of the game.
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {METRIC_KEYS.map(({ key, label }) => {
              const m = evaluation?.[key] as { score: number } | undefined
              return (
                <div key={String(key)}
                  className="border border-skin-border rounded-skin p-2 text-center">
                  <div className={`${muted} text-xs`}>{label.replace(/ \(.*\)/, '')}</div>
                  <div className={`font-bold text-lg ${scoreColor(m?.score ?? null)}`}>
                    {m?.score != null ? m.score.toFixed(1) : '—'}
                  </div>
                </div>
              )
            })}
          </div>

          {runningAvg != null && (
            <div className={`${muted} text-sm mt-3`}>
              Running average after {myScored.length} question{myScored.length === 1 ? '' : 's'}:{' '}
              <span className={`font-bold ${scoreColor(runningAvg)}`}>{runningAvg.toFixed(2)}</span>
            </div>
          )}

          <div className={`${muted} text-sm mt-2`}>
            Waiting for other players… ({totalConnected - waitingFor}/{totalConnected} ready)
          </div>
        </div>
      )}

      <div className={card}>
        <div className={`${muted} text-sm mb-2`}>Live leaderboard</div>
        <MiniLeaderboard state={state} me={me} />
      </div>
    </>
  )
}

function MiniLeaderboard({ state, me }: { state: RoomState; me: string }) {
  const rows = useMemo(() => {
    const computed = state.players.map((p) => {
      const scored = p.scores.filter((s): s is number => s != null)
      const total = scored.reduce((a, b) => a + b, 0)
      return { ...p, total, attempted: scored.length }
    })
    computed.sort((a, b) => b.total - a.total)
    return computed
  }, [state])

  return (
    <div className={stack}>
      {rows.map((p, i) => (
        <div key={p.user_id}
          className={`flex items-center gap-2 p-2 rounded-skin ${p.user_id === me ? 'bg-skin-surface-2' : ''}`}>
          <span className={`${muted} text-sm`} style={{ minWidth: 20 }}>{i + 1}.</span>
          {p.picture && <img src={p.picture} alt="" className={thumb} />}
          <span className="font-medium flex-1">{p.name}{p.user_id === me ? ' (you)' : ''}</span>
          <span className={`${muted} text-xs`}>{p.ready ? '✓ ready' : '…answering'}</span>
          <span className="font-bold">{p.total.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Final — table leaderboard + full AI feedback per question
// ─────────────────────────────────────────────────────────────────────────────
function FinalView({
  state, leaderboard, myEvals, onBack, onLeave,
}: {
  state: RoomState
  leaderboard: LeaderboardEntry[]
  myEvals: StoredEval[]
  onBack: () => void
  onLeave: () => void
}) {
  const winner = leaderboard[0]
  const questionCount = state.questions_total
  const qIndices = Array.from({ length: questionCount }, (_, i) => i)

  return (
    <>
      <div className={card} style={{ textAlign: 'center' }}>
        <div className={`${muted} text-sm`}>Winner of {state.name}</div>
        <div className="text-2xl font-extrabold mt-1">🏆 {winner?.name ?? '—'}</div>
        <div className={`${muted} text-sm mt-1`}>
          {winner ? `${winner.total.toFixed(1)} total · ${winner.avg.toFixed(1)} avg` : ''}
        </div>
      </div>

      {/* Table leaderboard */}
      <div className={card}>
        <h3 className="mt-0 mb-2">Final leaderboard</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-skin-border">
                <th className={`${muted} font-normal py-2 pr-2`} style={{ minWidth: 40 }}>#</th>
                <th className={`${muted} font-normal py-2 pr-2`}>Player</th>
                {qIndices.map((i) => (
                  <th key={i} className={`${muted} font-normal py-2 px-2 text-center`}>Q{i + 1}</th>
                ))}
                <th className={`${muted} font-normal py-2 pl-2 text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.user_id} className="border-b border-skin-border last:border-0">
                  <td className={`${muted} py-2 pr-2`}>{i + 1}</td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      {p.picture && <img src={p.picture} alt="" className={thumb} />}
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  {qIndices.map((qi) => {
                    const s = p.scores[qi]
                    return (
                      <td key={qi} className={`py-2 px-2 text-center ${scoreColor(s ?? null)}`}>
                        {s != null ? s.toFixed(1) : '—'}
                      </td>
                    )
                  })}
                  <td className="py-2 pl-2 text-right font-bold">{p.total.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed feedback — only this player's own, only at the end */}
      {myEvals.length > 0 && (
        <div className={card}>
          <h3 className="mt-0 mb-2">
            Your AI feedback{' '}
            <span className={`${muted} text-xs font-normal`}>(private to you)</span>
          </h3>
          <div className={stack}>
            {myEvals.map((e) => (
              <FeedbackBlock key={e.question_index} entry={e} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button className={btnGhost} onClick={onBack}>Back to rooms</button>
        <button className={btnPrimary} onClick={onLeave}>Leave room</button>
      </div>
    </>
  )
}

function FeedbackBlock({ entry }: { entry: StoredEval }) {
  const ev = entry.evaluation
  return (
    <details className="rounded-skin border border-skin-border">
      <summary className="cursor-pointer px-3 py-2 bg-skin-surface-2 rounded-skin">
        <span className={`${muted} text-xs mr-2`}>Q{entry.question_index + 1}</span>
        <span className="font-semibold">{entry.question_text}</span>
        {ev?.overall != null && (
          <span className={`float-right font-bold ${scoreColor(ev.overall)}`}>
            {ev.overall.toFixed(1)}/5
          </span>
        )}
      </summary>
      <div className="p-3 flex flex-col gap-3">
        {entry.transcript && (
          <div className="text-skin-text text-sm border-l-2 border-skin-border pl-3 whitespace-pre-wrap">
            {entry.transcript}
          </div>
        )}
        {ev && (
          <div className="flex flex-col">
            {METRIC_KEYS.map(({ key, label }) => {
              const m = ev[key] as { score: number; feedback: string } | undefined
              if (!m) return null
              return (
                <div key={String(key)}
                  className="grid grid-cols-[1fr_auto] gap-2 py-2 border-b border-dashed border-skin-border last:border-b-0">
                  <div>
                    <div className="font-semibold">{label}</div>
                    <div className="text-skin-muted text-[13px] mt-0.5">{m.feedback}</div>
                  </div>
                  <div className={`font-bold text-lg ${scoreColor(m.score)}`}>
                    {m.score.toFixed(1)}/5
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {ev?.summary && (
          <div className="text-[13px] px-3 py-2 rounded-skin bg-[var(--blue-50)] text-[var(--blue-800)] border border-[var(--blue-200)] dark:bg-[rgba(59,130,246,0.1)] dark:text-[var(--blue-300)] dark:border-[var(--blue-800)]">
            {ev.summary}
          </div>
        )}
        {ev && (ev.strengths?.length || ev.improvements?.length) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {ev.strengths && ev.strengths.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Strengths</div>
                <ul className="list-disc pl-5 m-0">
                  {ev.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {ev.improvements && ev.improvements.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Improvements</div>
                <ul className="list-disc pl-5 m-0">
                  {ev.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {ev && (ev.words_per_minute != null || ev.filler_count != null) && (
          <div className={`${muted} text-xs`}>
            {ev.words_per_minute != null && (
              <span className="mr-3">{Math.round(ev.words_per_minute)} WPM</span>
            )}
            {ev.filler_count != null && (
              <span>{ev.filler_count} filler word{ev.filler_count === 1 ? '' : 's'}</span>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
