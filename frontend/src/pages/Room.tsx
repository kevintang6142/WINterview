import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import {
  main, card, stack, spread, row, muted, tag, banner, bigQuestion, scorePill,
  metricRow, metricName, metricFb, metricScore,
  btnPrimary, btnGhost, thumb, ttsWord, ttsActive,
} from '../lib/ui'
import PacingGraph from '../components/PacingGraph'
import { ALL_CATEGORIES } from '../lib/categories'
import { Evaluation } from '../types'
import MasteryDropdown from '../components/MasteryDropdown'

// ── Types from the server ────────────────────────────────────────────────────
interface ServerPlayer {
  user_id: string
  name: string
  picture: string | null
  scores: (number | null)[]
  ready: boolean
  // True while the client is waiting on Gemini after recording.
  scoring: boolean
  connected: boolean
  // False when a game just ended and the player hasn't ack'd being back in
  // the lobby via {type: "return"} — shown as disconnected until they do.
  returned: boolean
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
    between_rounds_seconds: number
  }
  status: 'lobby' | 'running' | 'finished'
  players: ServerPlayer[]
  current_index: number
  current_question: ServerQuestion | null
  round_deadline: number | null
  // Unix seconds when the current round went live on the server.
  // Client timers are derived from this so refresh/rejoin is seamless.
  round_started_at: number | null
  intermission_until: number | null
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
  question_id: string
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
  // Kept true while the player is looking at the final leaderboard even
  // after the server resets the room to lobby. Cleared when the player
  // explicitly returns to the lobby.
  const [showingFinal, setShowingFinal] = useState(false)
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
        setShowingFinal(true)
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

  // From FinalView: ack being back in the lobby. Server resets to lobby
  // state (if first caller) and flips our `returned` flag.
  const returnToLobby = () => {
    send({ type: 'return' })
    setShowingFinal(false)
    setStoredEvals([])       // fresh run → fresh summary next game
    setFinalBoard(null)
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
    const label = state?.name?.trim() || state?.code
    if (label) document.title = `${label} · WINterview`
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
              <div className="text-xl font-extrabold leading-tight">
                {state.name?.trim() || 'Untitled room'}
              </div>
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

        {/* FinalView wins over everything else while we still have a
            leaderboard to show and the user hasn't pressed Return. This
            intentionally hides the lobby/session view even if the server
            has already reset the room to 'lobby'. */}
        {showingFinal && finalBoard && (
          <FinalView
            state={state}
            leaderboard={finalBoard}
            myEvals={storedEvals}
            onLeave={leave}
            onReturn={returnToLobby}
          />
        )}

        {!showingFinal && state.status === 'lobby' && (
          <LobbyView state={state} isHost={isHost} send={send} />
        )}

        {!showingFinal && state.status === 'running' && state.intermission_until && (
          <IntermissionView state={state} me={user?.id ?? ''} />
        )}

        {!showingFinal && state.status === 'running' && !state.intermission_until && state.current_question && (
          <SessionView
            state={state}
            me={user?.id ?? ''}
            send={send}
            recordEval={recordEval}
            key={state.current_index}
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
  const [betweenRoundsSeconds, setBetweenRoundsSeconds] = useState(String(state.settings.between_rounds_seconds ?? 3))
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
  const sendSettings = () => {
    if (!isHost) return
    const qc = Number(questionCount)
    const ms = Number(maxResponseSeconds)
    const mp = Number(maxPlayers)
    const br = Number(betweenRoundsSeconds)
    const catsArr = cats.size < ALL_CATEGORIES.length ? [...cats] : []
    if (!Number.isFinite(qc) || qc < 1 || qc > 10) return
    if (!Number.isFinite(ms) || ms < 30 || ms > 600) return
    if (!Number.isFinite(mp) || mp < 2 || mp > 20) return
    if (!Number.isFinite(br) || br < 0 || br > 30) return
    send({
      type: 'settings',
      settings: {
        question_count: qc,
        max_response_seconds: ms,
        company: company.trim() || null,
        max_players: mp,
        categories: catsArr,
        between_rounds_seconds: br,
      },
    })
  }

  // Debounced propagation whenever any host-editable value changes.
  useEffect(() => {
    if (!isHost) return
    const t = setTimeout(() => sendSettings(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCount, maxResponseSeconds, maxPlayers, betweenRoundsSeconds, company, cats])

  // Validate current numeric state for the Start button.
  const qcNum = Number(questionCount)
  const msNum = Number(maxResponseSeconds)
  const mpNum = Number(maxPlayers)
  const brNum = Number(betweenRoundsSeconds)
  const startErr =
    !isHost ? null :
    !Number.isFinite(qcNum) || qcNum < 1 || qcNum > 10 ? 'Questions must be 1–10' :
    !Number.isFinite(msNum) || msNum < 30 || msNum > 600 ? 'Max answer time must be 30–600s' :
    !Number.isFinite(mpNum) || mpNum < 2 || mpNum > 20 ? 'Max players must be 2–20' :
    !Number.isFinite(brNum) || brNum < 0 || brNum > 30 ? 'Between-rounds must be 0–30s' :
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
              {p.connected && !p.returned && (
                <span className={`${muted} text-xs`}>still on finish screen</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="mt-0 mb-2">
          Settings {!isHost && <span className={`${muted} text-xs font-normal`}>(host-only)</span>}
        </h3>
        <div className={stack}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className={muted}>Questions (1–10)</span>
              <input type="number" value={questionCount}
                disabled={!isHost}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="w-24 max-w-full" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={muted}>Max answer time (s, 30–600)</span>
              <input type="number" value={maxResponseSeconds}
                disabled={!isHost}
                onChange={(e) => setMaxResponseSeconds(e.target.value)}
                className="w-28 max-w-full" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={muted}>Max players (2–20)</span>
              <input type="number" value={maxPlayers}
                disabled={!isHost}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="w-24 max-w-full" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={muted}>Between rounds (s, 0–30)</span>
              <input type="number" value={betweenRoundsSeconds}
                disabled={!isHost}
                onChange={(e) => setBetweenRoundsSeconds(e.target.value)}
                className="w-24 max-w-full" />
            </label>
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
  // Speaking anchor: when MediaRecorder.start() fires. Drives duration_seconds
  // sent to the backend for pacing analysis.
  const recordStartRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const tickRef = useRef<number | null>(null)
  const timedOutRef = useRef(false)
  // Server-authoritative timer anchor. Elapsed = now - round_started_at so
  // every client sees the same number at the same wall-clock moment and
  // refresh/rejoin picks up the running clock.
  const roundStartedAt = state.round_started_at

  useEffect(() => {
    setScore(null)
    setEvaluation(null)
    setError(null)
    setElapsed(0)
    setAlignment(null)
    setHighlightIndex(-1)
    chunksRef.current = []
    recordStartRef.current = 0
    timedOutRef.current = false

    // Rejoin-in-progress: if the server already has me marked ready for this
    // round (refreshed/reconnected after submitting), skip straight to the
    // submitted state instead of replaying TTS and trying to record again.
    const meServer = state.players.find((p) => p.user_id === me)
    const alreadyScored = meServer?.scores?.[state.current_index]
    if (meServer?.ready && alreadyScored != null) {
      setPhase('submitted')
      setScore(alreadyScored)
      // Stub entry so the final summary still lists this question even
      // though we don't have the full Gemini feedback in memory after a
      // refresh. Better than missing entries entirely.
      recordEval({
        question_index: state.current_index,
        question_id: q.id,
        question_text: q.text,
        question_category: q.category || '',
        evaluation: null,
        transcript: '',
      })
      return
    }

    // Rejoin mid-round: if the round has been running for more than a short
    // grace window, this player didn't see the question go live — skip TTS
    // and jump straight into the recording phase so they don't waste time
    // re-reading the question while the clock's already ticking.
    const roundAgeSec = state.round_started_at
      ? Date.now() / 1000 - state.round_started_at
      : 0
    const REJOIN_GRACE = 1.5
    if (roundAgeSec > REJOIN_GRACE) {
      setPhase('ready-to-record')
      startRecording()
      return
    }

    setPhase('playing')
    playTTS()
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
      cancelAnimationFrame(rafRef.current)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id])

  // Server-authoritative ticker: elapsed = now - round_started_at. Every
  // client sees the same value at the same moment; refresh/rejoin picks up
  // the running clock instead of resetting; time spent away from the tab
  // still counts against the budget. Hard-cap enforced locally too so the
  // recorder stops cleanly when time runs out.
  useEffect(() => {
    if (phase === 'submitted' || phase === 'error') return
    if (!roundStartedAt) return
    const maxSecs = state.settings.max_response_seconds
    const applyTick = () => {
      const e = Math.max(0, Date.now() / 1000 - roundStartedAt)
      setElapsed(e)
      if (e >= maxSecs && !timedOutRef.current) {
        timedOutRef.current = true
        if (mediaRef.current && mediaRef.current.state !== 'inactive') {
          mediaRef.current.stop()
        } else if (phase === 'ready-to-record' || phase === 'playing') {
          // Recorder never went live before the cap — submit a zero.
          send({ type: 'submit_score', question_index: state.current_index, overall: 0 })
          setScore(0)
          setPhase('submitted')
        }
      }
    }
    applyTick()
    const iv = window.setInterval(applyTick, 200)
    tickRef.current = iv
    return () => { window.clearInterval(iv); tickRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundStartedAt, phase, state.settings.max_response_seconds])

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

  // Kick off the user's answer window after TTS has finished. Timer is
  // server-authoritative (state.round_started_at) so we don't set any local
  // anchor here.
  const beginAnswerWindow = () => {
    setPhase('ready-to-record')
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
      setPhase('recording')
    } catch (e: any) {
      setError(`Microphone error: ${e.message}`)
      setPhase('error')
    }
  }

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
  }

  const handleAudio = async (blob: Blob, duration: number) => {
    setPhase('processing')
    // Tell the room we're post-recording so the live leaderboard pill
    // switches from "answering Qx" to "scoring Qx".
    send({ type: 'scoring', value: true })
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
        question_id: q.id,
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
      // Still record a stub entry so the final summary shows every question
      // (otherwise failed rounds vanish from the feedback list entirely).
      recordEval({
        question_index: state.current_index,
        question_id: q.id,
        question_text: q.text,
        question_category: q.category || '',
        evaluation: null,
        transcript: '',
      })
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
            <>
              <button className={`${micBase} bg-skin-accent text-white opacity-50 cursor-not-allowed`} disabled>
                {phase === 'playing' ? 'Reading…' : '…'}
              </button>
              <div className={`${muted} tabular-nums`}>{fmt(elapsed)} / {fmt(maxSecs)}</div>
            </>
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
        <LiveScoreTable state={state} me={me} />
      </div>
    </>
  )
}

// Pill showing whether a player is ready for this round, disconnected, or
// still working on it. Replaces the plain "…answering" text.
function ReadyPill({ player, currentIndex }: { player: ServerPlayer; currentIndex: number }) {
  // A player who hasn't ack'd returning from the finish screen shows as
  // disconnected even though their WS is still open.
  if (!player.connected || !player.returned) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-skin-surface-2 text-skin-muted border border-skin-border">
        <span className="w-1.5 h-1.5 rounded-full bg-skin-muted" />
        {player.connected ? 'not in lobby' : 'offline'}
      </span>
    )
  }
  if (player.ready) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 5.5 L4 8 L8.5 2.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ready
      </span>
    )
  }
  if (player.scoring) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-[var(--blue-100)] text-[var(--blue-800)] border border-[var(--blue-200)] dark:bg-[rgba(96,165,250,0.18)] dark:text-[var(--blue-300)] dark:border-[var(--blue-800)]">
        <span className="relative inline-flex">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping absolute inset-0" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] relative" />
        </span>
        scoring Q{currentIndex + 1}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
      <span className="relative inline-flex">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-ping absolute inset-0" />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 relative" />
      </span>
      answering Q{currentIndex + 1}
    </span>
  )
}

// Table of all players' per-question scores + total. Visible throughout.
function LiveScoreTable({ state, me }: { state: RoomState; me: string }) {
  const qCount = state.questions_total
  const qIndices = Array.from({ length: qCount }, (_, i) => i)

  const rows = useMemo(() => {
    const computed = state.players.map((p) => {
      const scored = p.scores.filter((s): s is number => s != null)
      const total = scored.reduce((a, b) => a + b, 0)
      return { ...p, total }
    })
    computed.sort((a, b) => b.total - a.total)
    return computed
  }, [state])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-skin-border">
            <th className={`${muted} font-normal py-2 pr-2`} style={{ minWidth: 32 }}>#</th>
            <th className={`${muted} font-normal py-2 pr-2`}>Player</th>
            <th className={`${muted} font-normal py-2 pr-2`}>Status</th>
            {qIndices.map((i) => (
              <th key={i}
                className={`${muted} font-normal py-2 px-2 text-center ${
                  i === state.current_index ? 'text-skin-accent' : ''
                }`}>
                Q{i + 1}
              </th>
            ))}
            <th className={`${muted} font-normal py-2 pl-2 text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.user_id}
              className={`border-b border-skin-border last:border-0 ${
                p.user_id === me ? 'bg-skin-surface-2' : ''
              }`}>
              <td className={`${muted} py-2 pr-2`}>{i + 1}</td>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  {p.picture && <img src={p.picture} alt="" className={thumb} />}
                  <span className="font-medium">
                    {p.name}{p.user_id === me ? ' (you)' : ''}
                  </span>
                </div>
              </td>
              <td className="py-2 pr-2">
                <ReadyPill player={p} currentIndex={state.current_index} />
              </td>
              {qIndices.map((qi) => {
                const s = p.scores[qi]
                const isCurrent = qi === state.current_index
                return (
                  <td key={qi}
                    className={`py-2 px-2 text-center ${scoreColor(s ?? null)} ${
                      isCurrent ? 'bg-[var(--blue-50)] dark:bg-[rgba(59,130,246,0.08)]' : ''
                    }`}>
                    {s != null ? s.toFixed(1) : isCurrent ? '…' : '—'}
                  </td>
                )
              })}
              <td className="py-2 pl-2 text-right font-bold">{p.total.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Between-rounds countdown — server tells us when to unfreeze.
function IntermissionView({ state, me }: { state: RoomState; me: string }) {
  const target = state.intermission_until ?? 0
  const [remaining, setRemaining] = useState<number>(
    Math.max(0, target - Date.now() / 1000),
  )
  useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(Math.max(0, target - Date.now() / 1000))
    }, 100)
    return () => clearInterval(iv)
  }, [target])

  const seconds = Math.ceil(remaining)
  const isLast = state.current_index + 1 >= state.questions_total
  return (
    <>
      <div className={card} style={{ textAlign: 'center', padding: 48 }}>
        <div className={muted}>
          {isLast ? 'Final scores in' : `Next question in`}
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
          {seconds}
        </div>
      </div>

      <div className={card}>
        <div className={`${muted} text-sm mb-2`}>Live leaderboard</div>
        <LiveScoreTable state={state} me={me} />
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Final — table leaderboard + full AI feedback per question
// ─────────────────────────────────────────────────────────────────────────────
function FinalView({
  state, leaderboard, myEvals, onLeave, onReturn,
}: {
  state: RoomState
  leaderboard: LeaderboardEntry[]
  myEvals: StoredEval[]
  onLeave: () => void
  onReturn: () => void
}) {
  const winner = leaderboard[0]
  // Trust the leaderboard for column count — state may already be lobby.
  const questionCount = Math.max(state.questions_total, leaderboard[0]?.scores.length ?? 0)
  const qIndices = Array.from({ length: questionCount }, (_, i) => i)

  return (
    <>
      <div className={card} style={{ textAlign: 'center' }}>
        <div className={`${muted} text-sm`}>Winner of {state.name?.trim() || 'the room'}</div>
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

      {/* Detailed feedback — only this player's own, only at the end.
          Rendered in the same layout as the practice-mode summary. */}
      {myEvals.length > 0 && (
        <>
          <div className={banner}>
            This breakdown is <strong>private to you</strong>. Public shares only include
            your transcript and pacing data — never the AI scores or feedback.
          </div>
          {myEvals.map((e) => (
            <FeedbackBlock key={e.question_index} entry={e} />
          ))}
        </>
      )}

      <div className="flex gap-2 flex-wrap">
        <button className={btnPrimary} onClick={onReturn}>
          Back to room
        </button>
        <button className={btnGhost} onClick={onLeave}>
          Leave room
        </button>
      </div>
    </>
  )
}

function fmtDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return '—'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function FeedbackBlock({ entry }: { entry: StoredEval }) {
  const ev = entry.evaluation
  const fillerEntries = ev?.filler_words ? Object.entries(ev.filler_words) : []
  const duration = ev?.duration_seconds ?? 0
  return (
    <div className={card}>
      <div className={bigQuestion}>{entry.question_text}</div>
      {(entry.question_category || entry.question_id) && (
        <div className="flex items-center gap-2 flex-wrap mt-2.5 mb-1">
          {entry.question_category && <span className={tag}>{entry.question_category}</span>}
          {entry.question_id && <MasteryDropdown questionId={entry.question_id} />}
        </div>
      )}

      <div className={spread}>
        <div className={muted}>
          Time taken: <strong>{fmtDuration(duration)}</strong>
          {ev?.word_count != null && <> · Words: <strong>{ev.word_count}</strong></>}
        </div>
        {ev?.overall != null && (
          <span className={scorePill}>Overall {ev.overall.toFixed(1)}/5</span>
        )}
      </div>

      {entry.transcript ? (
        <div className={`${card} bg-skin-surface-2 mt-3.5`}>
          <strong>Your response</strong>
          <p className="whitespace-pre-wrap mt-1.5">{entry.transcript}</p>
        </div>
      ) : (
        <div className={`${card} bg-skin-surface-2 mt-3.5 ${muted}`}>
          No transcript captured for this round.
        </div>
      )}

      {ev && ev.pacing_timeline && ev.pacing_timeline.length > 0 && (
        <div className="mt-4">
          <div className={`${muted} mb-1.5`}>
            Average pacing: <strong>{ev.words_per_minute ?? 0} WPM</strong>
          </div>
          <PacingGraph
            timeline={ev.pacing_timeline}
            durationSeconds={duration}
          />
          <div className={`${row} flex-wrap gap-2 mt-2.5`}>
            <strong>{ev.filler_count ?? 0} filler words</strong>
            {fillerEntries.map(([w, n]) => <span key={w} className={tag}>{w}: {n}</span>)}
          </div>
        </div>
      )}

      {ev?.structure_star && (
        <div className="mt-4">
          {METRIC_KEYS.map(({ key, label }) => {
            const m = ev[key] as { score: number; feedback: string } | undefined
            if (!m) return null
            return (
              <div key={String(key)} className={metricRow}>
                <div>
                  <div className={metricName}>{label}</div>
                  <div className={metricFb}>{m.feedback}</div>
                </div>
                <div className={metricScore}>{m.score.toFixed(1)}/5</div>
              </div>
            )
          })}
        </div>
      )}

      {ev && ((ev.strengths?.length ?? 0) > 0 || (ev.improvements?.length ?? 0) > 0) && (
        <div className="mt-3.5">
          {(ev.strengths?.length ?? 0) > 0 && (
            <>
              <strong>Strengths</strong>
              <ul>{ev.strengths!.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          {(ev.improvements?.length ?? 0) > 0 && (
            <>
              <strong>Improvements</strong>
              <ul>{ev.improvements!.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
        </div>
      )}

      {ev?.summary && <div className={`${banner} mt-3.5`}>{ev.summary}</div>}
    </div>
  )
}
