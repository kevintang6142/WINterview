import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useSettings } from '../settings'
import { main, card, stack, muted, spinner, ttsWord, ttsActive, btnPrimary, btnGhost } from '../lib/ui'
import { Session, SessionPhase } from '../types'

interface WordTiming { start: number; end: number; word: string }
interface Segment { text: string; word_index: number }
interface Alignment { words: WordTiming[]; segments: Segment[] }
interface EvalResult {
  id: string; evaluation: any; transcript: string
  duration_seconds: number; question_id: string; question_text: string
}

export default function SessionRun() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { settings } = useSettings()

  const [session, setSession] = useState<Session | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [phase, setPhase] = useState<SessionPhase>('loading')
  const [transcript, setTranscript] = useState('')
  const [typedText, setTypedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const rafRef = useRef<number>(0)
  const [countdown, setCountdown] = useState(0)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [recordElapsed, setRecordElapsed] = useState(0)
  const recordTickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [preRecordCountdown, setPreRecordCountdown] = useState(0)
  const preRecordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pendingEvalsRef = useRef<Promise<EvalResult>[]>([])
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef<Record<number, boolean>>({})

  useEffect(() => {
    const cached = sessionStorage.getItem(`session:${id}`)
    if (cached) { setSession(JSON.parse(cached)); setPhase('idle') }
    else setError('Session not found in this tab. Start a new one.')
  }, [id])

  const current = session?.questions?.[qIndex]
  const isLast = session != null && qIndex === session.questions.length - 1

  useEffect(() => {
    if (!current) return
    if (hasPlayedRef.current[qIndex]) return
    hasPlayedRef.current[qIndex] = true
    if (settings.ttsEnabled) playQuestion()
    else onTTSFinished()
  }, [qIndex, session])

  const playQuestion = async () => {
    if (!current) return
    setHighlightIndex(-1); setAlignment(null); setPhase('playing')
    try {
      const resp = await api.post('/voice/tts-timed', { text: current.text, voice_id: settings.ttsVoiceId })
      const { audio_base64, words, segments } = resp
      const ws: WordTiming[] = words || []
      setAlignment({ words: ws, segments: segments || [] })
      const audio = new Audio(`data:audio/mpeg;base64,${audio_base64}`)
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
      audio.onplay  = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tick) }
      audio.onpause = () => cancelAnimationFrame(rafRef.current)
      audio.onended = () => { cancelAnimationFrame(rafRef.current); setHighlightIndex(-1); audioRef.current = null; onTTSFinished() }
      audio.onerror = () => { cancelAnimationFrame(rafRef.current); audioRef.current = null; setPhase('idle') }
      await audio.play()
    } catch (e: any) {
      setPhase('idle'); setError(`Couldn't read question aloud: ${e.message}`); onTTSFinished()
    }
  }

  const onTTSFinished = () => {
    if (!settings.typeMode && settings.autoRecord) {
      if (!settings.ttsEnabled && settings.preRecordDelay > 0) {
        setPhase('idle')
        setPreRecordCountdown(settings.preRecordDelay)
        if (preRecordTimerRef.current) clearInterval(preRecordTimerRef.current)
        preRecordTimerRef.current = setInterval(() => {
          setPreRecordCountdown((c) => {
            if (c <= 1) {
              clearInterval(preRecordTimerRef.current!)
              preRecordTimerRef.current = null
              startRecording()
              return 0
            }
            return c - 1
          })
        }, 1000)
      } else {
        // Skip idle entirely — go straight to recording to avoid button flash
        setTimeout(() => startRecording(), 250)
      }
    } else {
      setPhase('idle')
    }
  }

  const startRecording = async () => {
    setError(null); setTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        handleRecordingComplete(new Blob(chunksRef.current, { type: mime }), (Date.now() - startedAtRef.current) / 1000)
      }
      mediaRef.current = rec; startedAtRef.current = Date.now(); rec.start(); setPhase('recording')
      setRecordElapsed(0)
      if (recordTickerRef.current) clearInterval(recordTickerRef.current)
      recordTickerRef.current = setInterval(() => setRecordElapsed((Date.now() - startedAtRef.current) / 1000), 200)
      const capMs = Math.max(10, Number(settings.maxResponseSeconds) || 180) * 1000
      if (recordAutoStopRef.current) clearTimeout(recordAutoStopRef.current)
      recordAutoStopRef.current = setTimeout(() => {
        if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
      }, capMs)
    } catch (e: any) { setError(`Microphone error: ${e.message}`); setPhase('idle') }
  }

  const stopRecording = () => {
    if (recordTickerRef.current) { clearInterval(recordTickerRef.current); recordTickerRef.current = null }
    if (recordAutoStopRef.current) { clearTimeout(recordAutoStopRef.current); recordAutoStopRef.current = null }
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
  }

  const submitTyped = async () => {
    if (!typedText.trim()) return
    const q = current!
    const text = typedText.trim()
    setTypedText('')
    const evalPromise: Promise<EvalResult> = api.post('/responses', {
      session_id: id,
      question_id: q.id,
      transcript: text,
      duration_seconds: 0,
    }).then((saved: any) => ({
      id: saved.id, evaluation: saved.evaluation, transcript: text,
      duration_seconds: 0, question_id: q.id, question_text: q.text,
    }))
    evalPromise.catch(() => {})
    pendingEvalsRef.current.push(evalPromise)
    if (settings.autoAdvance) {
      if (isLast) finishSession(); else beginCountdown()
    } else {
      setPhase('saved')
      evalPromise.catch(() => {})
    }
  }

  const handleRecordingComplete = (blob: Blob, duration: number) => {
    const q = current!
    const evalPromise: Promise<EvalResult> = (async () => {
      const fd = new FormData()
      fd.append('audio', blob, 'answer.webm')
      const { text, word_timestamps } = await api.postForm('/voice/stt', fd)
      const saved = await api.post('/responses', {
        session_id: id, question_id: q.id, transcript: text,
        duration_seconds: duration, word_timestamps: word_timestamps ?? [],
      })
      return { id: saved.id, evaluation: saved.evaluation, transcript: text, duration_seconds: duration, question_id: q.id, question_text: q.text }
    })()
    evalPromise.catch(() => {})
    pendingEvalsRef.current.push(evalPromise)
    if (settings.autoAdvance) {
      if (isLast) finishSession(); else beginCountdown()
    } else {
      setPhase('saved')
      evalPromise.catch(() => {})
    }
  }

  const beginCountdown = () => {
    const secs = Math.max(0, Number(settings.autoAdvanceSeconds) || 0)
    if (secs === 0) { setQIndex((i) => i + 1); setPhase('idle'); return }
    setCountdown(secs); setPhase('countdown')
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countdownTimerRef.current!); countdownTimerRef.current = null; setQIndex((i) => i + 1); setPhase('idle'); return 0 }
        return c - 1
      })
    }, 1000)
  }

  useEffect(() => () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    if (preRecordTimerRef.current) clearInterval(preRecordTimerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (recordTickerRef.current) clearInterval(recordTickerRef.current)
    if (recordAutoStopRef.current) clearTimeout(recordAutoStopRef.current)
  }, [])

  const fmtClock = (secs: number) => {
    const s = Math.max(0, Math.floor(secs)); const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  const manualNext = () => {
    if (preRecordTimerRef.current) { clearInterval(preRecordTimerRef.current); preRecordTimerRef.current = null }
    setPreRecordCountdown(0)
    if (isLast) finishSession()
    else { setQIndex((i) => i + 1); setTranscript(''); setTypedText(''); setPhase('idle') }
  }

  const finishSession = async () => {
    setPhase('waiting-all')
    try {
      const results = await Promise.allSettled(pendingEvalsRef.current)
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<EvalResult>).value)
      await api.post(`/sessions/${id}/complete`).catch(() => {})
      sessionStorage.setItem(`session-results:${id}`, JSON.stringify(ok))
      nav(`/session/${id}/result`)
    } catch (e: any) { setError(`Could not finalize session: ${e.message}`); setPhase('idle') }
  }

  const questionNode = useMemo(() => {
    if (!current) return null
    const segs = alignment?.segments
    if (!segs || segs.length === 0) return <span>{current.text}</span>
    // Always render segments to avoid DOM restructuring when TTS ends (causes layout flash).
    // Only apply highlight classes during active playback.
    return segs.map((seg, i) => {
      if (seg.word_index === -1) return <span key={i}>{seg.text}</span>
      const isActive = phase === 'playing' && seg.word_index === highlightIndex
      return (
        <span key={i} className={phase === 'playing' ? (isActive ? ttsActive : ttsWord) : ''}>
          {seg.text}
        </span>
      )
    })
  }, [current, alignment, highlightIndex, phase])

  if (error && !session) return <div className={main}><div className={card}>{error}</div></div>
  if (!session) return <div className={main}><div className={card}>Loading session…</div></div>

  if (phase === 'waiting-all') return (
    <div className={main}>
      <div className={`${card} text-center py-12`}>
        <div className={spinner} aria-label="Loading" />
        <h3 className="my-5 mb-1.5">Processing your answers…</h3>
        <div className={muted}>Transcribing audio and scoring with Gemini. Don't close this tab.</div>
      </div>
    </div>
  )

  const micBase = 'w-24 h-24 rounded-full text-sm inline-flex items-center justify-center font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0'

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <div className={`${muted} mb-1`}>Question {qIndex + 1} of {session.questions.length}</div>
          <div className="text-lg font-semibold leading-snug mb-4">{questionNode}</div>

          {phase === 'countdown' ? (
            <div className="text-center py-8">
              <div className={muted}>Answer submitted — next question in</div>
              <div className="text-[72px] font-extrabold text-skin-accent leading-none">{countdown}</div>
            </div>
          ) : settings.typeMode ? (
            <>
              <textarea
                className="w-full mt-2 mb-3"
                placeholder="Type your answer here…"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                disabled={phase === 'transcribing'}
                rows={6}
              />
              {phase === 'transcribing' ? (
                <div className={muted}>Saving…</div>
              ) : (
                <button className={btnPrimary} onClick={submitTyped} disabled={!typedText.trim() || phase === 'playing'}>
                  {phase === 'playing' ? '🔊 Reading question…' : 'Submit answer'}
                </button>
              )}
              {!settings.autoAdvance && phase === 'saved' && (
                <div className="mt-4">
                  <button className={btnPrimary} onClick={manualNext}>
                    {isLast ? 'Finish & see results' : 'Next question →'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col items-center my-6 gap-2">
                {phase === 'recording' ? (
                  <>
                    <button className={`${micBase} bg-skin-danger text-white animate-mic-pulse`} onClick={stopRecording}>⏹ Stop</button>
                    <div className={`${muted} tabular-nums`}>{fmtClock(recordElapsed)} / {fmtClock(settings.maxResponseSeconds)}</div>
                  </>
                ) : phase === 'saved' ? (
                  <>
                    <button className={`${micBase} bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800 cursor-not-allowed`} disabled>Saved</button>
                    <div className={`${muted} tabular-nums`}>{fmtClock(recordElapsed)} / {fmtClock(settings.maxResponseSeconds)}</div>
                  </>
                ) : phase === 'idle' ? (
                  preRecordCountdown > 0 ? (
                    <button className={`${micBase} bg-skin-accent text-white opacity-75`} disabled>
                      {preRecordCountdown}
                    </button>
                  ) : (
                    <button className={`${micBase} bg-skin-accent text-white hover:bg-[var(--blue-700)] transition-colors`}
                      onClick={startRecording}>🎤 Record</button>
                  )
                ) : (
                  <button className={`${micBase} bg-skin-accent text-white opacity-50 cursor-not-allowed`} disabled>
                    {phase === 'playing' ? 'Reading…' : '…'}
                  </button>
                )}
              </div>

              {error && <div className={`${card} bg-skin-surface-2 text-skin-danger`}>{error}</div>}

              {!settings.autoAdvance && phase === 'saved' && (
                <div className="mt-4">
                  <button className={btnPrimary} onClick={manualNext}>
                    {isLast ? 'Finish & see results' : 'Next question →'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
