import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { main, card, stack, spread, muted, btnPrimary, btnGhost, thumb } from '../lib/ui'
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

// ── WebSocket URL ────────────────────────────────────────────────────────────
function wsUrl(code: string): string {
  const base = (api.base || '').replace(/^http/, 'ws')
  const token = localStorage.getItem('winterview.token') || ''
  return `${base}/rooms/${code}/ws?token=${encodeURIComponent(token)}`
}

// ── Score color (matches problem index) ──────────────────────────────────────
function scoreColor(score: number | null): string {
  if (score == null) return 'text-skin-muted'
  if (score >= 4) return 'text-emerald-700 dark:text-emerald-400'
  if (score >= 3) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-700 dark:text-red-400'
}

export default function Room() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState<RoomState | null>(null)
  const [finalBoard, setFinalBoard] = useState<LeaderboardEntry[] | null>(null)
  const [wsError, setWsError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

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
      if (ev.code === 4404) setWsError('Room not found. It may have ended.')
      else if (ev.code === 4401) setWsError('Please sign in again.')
    }
    return () => { try { ws.close() } catch {} }
  }, [code])

  const send = (msg: any) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  const leave = () => {
    send({ type: 'leave' })
    try { wsRef.current?.close() } catch {}
    nav('/rooms')
  }

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
    return (
      <div className={main}>
        <div className={card}>Connecting to room <code>{code}</code>…</div>
      </div>
    )
  }

  const isHost = user?.id === state.host_user_id

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <div className={`${spread} flex-wrap gap-2`}>
            <div>
              <div className={`${muted} text-xs`}>Room code</div>
              <div style={{ fontFamily: 'monospace', letterSpacing: '0.15em', fontSize: 22, fontWeight: 700 }}>
                {state.code}
              </div>
            </div>
            <div className={`${muted} text-sm text-right`}>
              <div>{state.is_public ? 'Public' : 'Private'} · {state.status}</div>
              <div>{state.players.length}/{state.settings.max_players} players</div>
            </div>
            <button className={btnGhost} onClick={leave}>Leave</button>
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
            key={state.current_index}   // reset on each round
          />
        )}

        {state.status === 'finished' && finalBoard && (
          <FinalView state={state} leaderboard={finalBoard} />
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Lobby
// ────────────────────────────────────────────────────────────────────────────
function LobbyView({
  state, isHost, send,
}: { state: RoomState; isHost: boolean; send: (m: any) => void }) {
  const [questionCount, setQuestionCount] = useState(state.settings.question_count)
  const [maxResponseSeconds, setMaxResponseSeconds] = useState(state.settings.max_response_seconds)
  const [company, setCompany] = useState(state.settings.company ?? '')
  const [maxPlayers, setMaxPlayers] = useState(state.settings.max_players)
  const [cats, setCats] = useState<Set<string>>(
    new Set(
      state.settings.categories.length > 0 ? state.settings.categories : ALL_CATEGORIES,
    ),
  )

  const toggleCat = (cat: string) =>
    setCats((prev) => {
      const n = new Set(prev)
      if (n.has(cat)) n.delete(cat); else n.add(cat)
      return n
    })

  const saveSettings = () => {
    const catsArr = cats.size < ALL_CATEGORIES.length ? [...cats] : []
    send({
      type: 'settings',
      settings: {
        question_count: questionCount,
        max_response_seconds: maxResponseSeconds,
        company: company.trim() || null,
        max_players: maxPlayers,
        categories: catsArr,
      },
    })
  }

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
        <h3 className="mt-0 mb-2">Settings {!isHost && <span className={`${muted} text-xs font-normal`}>(host-only)</span>}</h3>
        <div className={stack}>
          <div className="flex items-center gap-4 flex-wrap">
            <label className={muted}>Questions (1–10)</label>
            <input type="number" min={1} max={10} value={questionCount}
              disabled={!isHost}
              onChange={(e) => setQuestionCount(Math.max(1, Math.min(10, Number(e.target.value))))}
              style={{ width: 80 }} />
            <label className={muted}>Max answer time (s)</label>
            <input type="number" min={30} max={600} step={15} value={maxResponseSeconds}
              disabled={!isHost}
              onChange={(e) => setMaxResponseSeconds(Math.max(30, Math.min(600, Number(e.target.value))))}
              style={{ width: 90 }} />
            <label className={muted}>Max players</label>
            <input type="number" min={2} max={20} value={maxPlayers}
              disabled={!isHost}
              onChange={(e) => setMaxPlayers(Math.max(2, Math.min(20, Number(e.target.value))))}
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
                  onClick={() => isHost && toggleCat(cat)}
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
            <div className="flex gap-2">
              <button className={btnGhost} onClick={saveSettings}>Save settings</button>
              <button className={btnPrimary} onClick={() => send({ type: 'start' })}
                disabled={state.players.length < 1}>
                Start competition
              </button>
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

// ────────────────────────────────────────────────────────────────────────────
// In-session: play TTS, record, submit score, then wait
// ────────────────────────────────────────────────────────────────────────────
type Phase = 'playing' | 'ready-to-record' | 'recording' | 'processing' | 'submitted' | 'error'

function SessionView({
  state, me, send,
}: { state: RoomState; me: string; send: (m: any) => void }) {
  const q = state.current_question!
  const [phase, setPhase] = useState<Phase>('playing')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [transcript, setTranscript] = useState('')
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tickRef = useRef<number | null>(null)
  const stopRef = useRef<number | null>(null)
  const hardCapRef = useRef<number | null>(null)

  // Per-round cleanup
  useEffect(() => {
    setPhase('playing')
    setScore(null)
    setTranscript('')
    setEvaluation(null)
    setError(null)
    setElapsed(0)
    chunksRef.current = []

    // Hard cap: auto-stop the recording when max_response_seconds elapses.
    // Play TTS first; if TTS fails we fall back to immediate record state.
    playTTS()

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
      if (stopRef.current) window.clearTimeout(stopRef.current)
      if (hardCapRef.current) window.clearTimeout(hardCapRef.current)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
    }
  }, [q.id])

  const playTTS = async () => {
    try {
      const resp = await api.post('/voice/tts-timed', { text: q.text })
      const url = `data:audio/mpeg;base64,${resp.audio_base64}`
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { audioRef.current = null; setPhase('ready-to-record'); startRecording() }
      audio.onerror = () => { audioRef.current = null; setPhase('ready-to-record'); startRecording() }
      await audio.play()
    } catch {
      setPhase('ready-to-record')
      startRecording()
    }
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
        const duration = (Date.now() - startedAtRef.current) / 1000
        const blob = new Blob(chunksRef.current, { type: mime })
        handleAudio(blob, duration)
      }
      mediaRef.current = rec
      startedAtRef.current = Date.now()
      rec.start()
      setPhase('recording')
      tickRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startedAtRef.current) / 1000)
      }, 200)
      hardCapRef.current = window.setTimeout(() => {
        if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
      }, state.settings.max_response_seconds * 1000)
    } catch (e: any) {
      setError(`Microphone error: ${e.message}`)
      setPhase('error')
    }
  }

  const stopRecording = () => {
    if (tickRef.current) window.clearInterval(tickRef.current)
    if (hardCapRef.current) window.clearTimeout(hardCapRef.current)
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
  }

  const handleAudio = async (blob: Blob, duration: number) => {
    setPhase('processing')
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'answer.webm')
      const stt = await api.postForm('/voice/stt', fd)
      setTranscript(stt.text ?? '')
      const saved = await api.post('/responses', {
        session_id: `room:${state.code}`,
        question_id: q.id,
        transcript: stt.text ?? '',
        duration_seconds: duration,
        word_timestamps: stt.word_timestamps ?? [],
      })
      const ev: Evaluation | undefined = saved?.evaluation
      const overall = ev?.overall ?? 0
      setScore(overall)
      setEvaluation(ev ?? null)
      send({ type: 'submit_score', question_index: state.current_index, overall })
      setPhase('submitted')
    } catch (e: any) {
      setError(`Failed: ${e.message}. Submitting a 0.`)
      send({ type: 'submit_score', question_index: state.current_index, overall: 0 })
      setPhase('submitted')
    }
  }

  const skip = () => {
    stopRecording()
    send({ type: 'submit_score', question_index: state.current_index, overall: 0 })
    setPhase('submitted')
    setScore(0)
  }

  const maxSecs = state.settings.max_response_seconds
  const you = state.players.find((p) => p.user_id === me)
  const waitingFor = state.players.filter((p) => p.connected && !p.ready).length
  const totalConnected = state.players.filter((p) => p.connected).length

  return (
    <>
      <div className={card}>
        <div className={`${muted} text-sm`}>
          Question {state.current_index + 1} of {state.questions_total}
        </div>
        <div className="text-[22px] font-extrabold leading-tight mt-1">
          {q.text}
        </div>
        {q.category && (
          <div className={`${muted} text-xs mt-1`}>{q.category}</div>
        )}
      </div>

      <div className={card}>
        {phase === 'playing' && (
          <div className={muted}>🔊 Reading the question…</div>
        )}

        {phase === 'ready-to-record' && (
          <div className={muted}>Starting recording…</div>
        )}

        {phase === 'recording' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <button className={`${btnPrimary} px-6 py-3 rounded-full`} onClick={stopRecording}>
              ⏹ Stop & submit
            </button>
            <div className={`${muted} text-sm`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(elapsed)} / {fmt(maxSecs)}
            </div>
            <button className={`${btnGhost} text-xs`} onClick={skip}>
              Skip this round
            </button>
          </div>
        )}

        {phase === 'processing' && (
          <div className={muted}>Transcribing & scoring your answer…</div>
        )}

        {phase === 'submitted' && (
          <div className={stack}>
            <div className={spread}>
              <div>
                Your score:{' '}
                <span className={`font-bold text-xl ${scoreColor(score)}`}>
                  {score != null ? score.toFixed(1) : '—'}/5
                </span>
              </div>
              <div className={`${muted} text-xs`}>
                Feedback below is private to you.
              </div>
            </div>
            <PrivateFeedback evaluation={evaluation} transcript={transcript} />
            <div className={muted}>
              Waiting for other players… ({totalConnected - waitingFor}/{totalConnected} ready)
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-skin-danger">{error}</div>
        )}
      </div>

      <div className={card}>
        <div className={`${muted} text-sm mb-2`}>Live leaderboard</div>
        <MiniLeaderboard state={state} me={me} />
        {you && (
          <div className={`${muted} text-xs mt-2`}>
            Your scores so far: {you.scores.map((s, i) => (
              <span key={i} className="mr-2">Q{i + 1}: <span className={scoreColor(s)}>{s != null ? s.toFixed(1) : '—'}</span></span>
            ))}
          </div>
        )}
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

// ────────────────────────────────────────────────────────────────────────────
// Final
// ────────────────────────────────────────────────────────────────────────────
function FinalView({
  state, leaderboard,
}: { state: RoomState; leaderboard: LeaderboardEntry[] }) {
  const winner = leaderboard[0]
  return (
    <>
      <div className={card} style={{ textAlign: 'center' }}>
        <div className={`${muted} text-sm`}>Winner</div>
        <div className="text-2xl font-extrabold mt-1">🏆 {winner?.name ?? '—'}</div>
        <div className={`${muted} text-sm mt-1`}>
          {winner ? `${winner.total.toFixed(1)} total · ${winner.avg.toFixed(1)} avg` : ''}
        </div>
      </div>
      <div className={card}>
        <h3 className="mt-0 mb-2">Final leaderboard</h3>
        <div className={stack}>
          {leaderboard.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-3 p-2 border-b border-skin-border last:border-0">
              <span className={`${muted} text-sm`} style={{ minWidth: 24 }}>{i + 1}.</span>
              {p.picture && <img src={p.picture} alt="" className={thumb} />}
              <span className="flex-1 font-medium">{p.name}</span>
              <span className="text-xs text-skin-muted">
                {p.scores.map((s, qi) => (
                  <span key={qi} className="mr-1.5">
                    Q{qi + 1}: <span className={scoreColor(s)}>{s != null ? s.toFixed(1) : '—'}</span>
                  </span>
                ))}
              </span>
              <span className="font-bold w-16 text-right">{p.total.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <Link to="/rooms" className={btnPrimary}>Back to rooms</Link>
      </div>
    </>
  )
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ── Private AI feedback (shown only to the player who gave the answer) ───────
const METRIC_LABELS: { key: keyof Evaluation; label: string }[] = [
  { key: 'structure_star',    label: 'Structure (STAR)' },
  { key: 'specificity_depth', label: 'Specificity & Depth' },
  { key: 'delivery_pacing',   label: 'Delivery (Pacing & Fillers)' },
  { key: 'relevance',         label: 'Relevance to Question' },
  { key: 'reflection',        label: 'Reflection & Self-Awareness' },
]

function PrivateFeedback({
  evaluation, transcript,
}: { evaluation: Evaluation | null; transcript: string }) {
  if (!evaluation) {
    return (
      <details className="rounded-skin border border-skin-border">
        <summary className="cursor-pointer px-3 py-2 bg-skin-surface-2 rounded-skin">
          Your transcript
        </summary>
        <div className="p-3 text-skin-text whitespace-pre-wrap">
          {transcript || <span className={muted}>No transcript.</span>}
        </div>
      </details>
    )
  }
  return (
    <details open className="rounded-skin border border-skin-border">
      <summary className="cursor-pointer px-3 py-2 bg-skin-surface-2 rounded-skin font-semibold">
        Your AI feedback
      </summary>
      <div className="p-3 flex flex-col gap-3">
        {transcript && (
          <div className="text-skin-text text-sm border-l-2 border-skin-border pl-3 whitespace-pre-wrap">
            {transcript}
          </div>
        )}

        <div className="flex flex-col">
          {METRIC_LABELS.map(({ key, label }) => {
            const m = evaluation[key] as { score: number; feedback: string } | undefined
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

        {evaluation.summary && (
          <div className="text-[13px] px-3 py-2 rounded-skin bg-[var(--blue-50)] text-[var(--blue-800)] border border-[var(--blue-200)] dark:bg-[rgba(59,130,246,0.1)] dark:text-[var(--blue-300)] dark:border-[var(--blue-800)]">
            {evaluation.summary}
          </div>
        )}

        {(evaluation.strengths?.length || evaluation.improvements?.length) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {evaluation.strengths && evaluation.strengths.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Strengths</div>
                <ul className="list-disc pl-5 m-0">
                  {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {evaluation.improvements && evaluation.improvements.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Improvements</div>
                <ul className="list-disc pl-5 m-0">
                  {evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {(evaluation.words_per_minute != null || evaluation.filler_count != null) && (
          <div className={`${muted} text-xs`}>
            {evaluation.words_per_minute != null && (
              <span className="mr-3">{Math.round(evaluation.words_per_minute)} WPM</span>
            )}
            {evaluation.filler_count != null && (
              <span>{evaluation.filler_count} filler word{evaluation.filler_count === 1 ? '' : 's'}</span>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
